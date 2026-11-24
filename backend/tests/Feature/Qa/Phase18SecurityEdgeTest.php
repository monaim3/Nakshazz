<?php

namespace Tests\Feature\Qa;

use App\Models\ActivityLog;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\Customer;
use App\Models\DeliveryZone;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Review;
use App\Models\User;
use App\Services\OrderService;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Security audit, phase 18 (24 Nov 2026): attacker-style edge cases on a copy of the shop
 * (test database only). Every check goes straight at the API: hidden buttons are not security.
 */
#[Group('qa')]
class Phase18SecurityEdgeTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    private DeliveryZone $zone;

    private ProductVariant $variant;

    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(StoreSettingSeeder::class);
        Storage::fake('public');
        Storage::fake('local');
        $this->owner = User::factory()->owner()->create();
        $this->staff = User::factory()->create();
        $this->zone = DeliveryZone::factory()->create(['charge' => '70.00']);
        $this->variant = ProductVariant::factory()->for(Product::factory()->for(Category::factory()))->withStock(10)->create(['price' => '1000.00', 'is_default' => true]);
        $this->order = app(OrderService::class)->placeWebsiteOrder($this->checkout());
    }

    /** Junk an attacker would throw at every field. */
    private const JUNK = [
        ['a' => ['b' => ['c' => 'deep']]], "' OR 1=1 --", '<script>alert(1)</script>', "\0null\0byte", '-1', '1e308', '0x1F', '99999999999999999999',
        '../../../../etc/passwd', '{{7*7}}', '${7*7}', '😀🔥💎', '   ', true, -5, 1.5,
    ];

    // ───────────── 1. no request of any shape makes the server crash ─────────────

    #[Test]
    public function e1_fuzzing_every_route_with_junk_never_gives_a_server_error(): void
    {
        $crashes = [];
        $ids = ['1', '999999', 'abc', '-1', '1%20OR%201=1', str_repeat('9', 40)];

        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/v1') || in_array('throttle:login', $route->gatherMiddleware(), true)) {
                continue;
            }
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                foreach ($ids as $id) {
                    $uri = '/'.preg_replace('/\{[^}]+\}/', $id, $route->uri());
                    foreach ([$this->owner, null] as $user) {
                        foreach (self::JUNK as $junk) {
                            $payload = ['q' => $junk, 'status' => $junk, 'amount' => $junk, 'items' => $junk, 'name' => $junk, 'date' => $junk, 'page' => $junk, 'per_page' => $junk, 'from' => $junk, 'sort' => $junk];
                            $response = $user ? $this->actingAs($user)->json($method, $uri, $payload) : $this->json($method, $uri, $payload);
                            if ($response->status() >= 500) {
                                $crashes[] = "{$method} {$uri} ".json_encode($junk).' → '.$response->status().' '.mb_substr((string) $response->json('message'), 0, 120);
                            }
                        }
                    }
                    if (! str_contains($route->uri(), '{')) {
                        break;
                    }
                }
            }
            app('auth')->forgetGuards();
        }

        $this->assertSame([], array_values(array_unique($crashes)));
    }

    // ───────────── 2. who may do what ─────────────

    #[Test]
    public function e2_staff_and_guests_cannot_reach_any_new_owner_tool(): void
    {
        foreach (['/api/v1/admin/closing', '/api/v1/admin/restock', '/api/v1/admin/activity', '/api/v1/admin/exports/orders', '/api/v1/admin/exports/customers', '/api/v1/admin/exports/payments'] as $url) {
            $this->actingAs($this->staff)->getJson($url)->assertForbidden();
            app('auth')->forgetGuards();
            $this->getJson($url)->assertUnauthorized();
        }
        $this->actingAs($this->staff)->postJson('/api/v1/admin/closing', ['date' => now()->toDateString(), 'method' => 'cash', 'counted' => '0'])->assertForbidden();
    }

    #[Test]
    public function e3_staff_cannot_promote_themselves_or_switch_off_the_owner(): void
    {
        $this->actingAs($this->staff)->patchJson("/api/v1/admin/users/{$this->staff->id}", ['role' => 'owner'])->assertForbidden();
        $this->actingAs($this->staff)->patchJson("/api/v1/admin/users/{$this->owner->id}", ['is_active' => false])->assertForbidden();
        $this->actingAs($this->staff)->postJson('/api/v1/admin/users', ['name' => 'X', 'email' => 'x@example.com', 'password' => 'Secret123!', 'role' => 'owner'])->assertForbidden();
        $this->assertSame('staff', $this->staff->refresh()->role->value);
        $this->assertTrue($this->owner->refresh()->is_active);
    }

    #[Test]
    public function e4_a_switched_off_account_is_locked_out_on_its_very_next_request(): void
    {
        $this->actingAs($this->staff)->getJson('/api/v1/admin/me')->assertOk();
        $this->staff->forceFill(['is_active' => false])->save();
        $this->actingAs($this->staff->refresh())->getJson('/api/v1/admin/orders')->assertForbidden();
        $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', ['channel' => 'whatsapp', 'status' => 'delivered', 'items' => [['variant_id' => $this->variant->id, 'quantity' => 1]], 'payment' => ['method' => 'cash']])->assertForbidden();
    }

    // ───────────── 3. tampering with money and stock ─────────────

    #[Test]
    public function e5_checkout_quantities_that_try_to_break_stock_or_money_are_refused(): void
    {
        $before = [$this->variant->refresh()->stock_on_hand, $this->variant->stock_reserved, Order::query()->count()];

        foreach ([0, -1, -100, 1.5, '1e3', '2; DROP TABLE orders', [1], null, 100000, PHP_INT_MAX] as $quantity) {
            $status = $this->postJson('/api/v1/checkout', $this->checkout(['items' => [['variant_id' => $this->variant->id, 'quantity' => $quantity]]]))->status();
            // 429 = the per-phone checkout limit stepped in first, which also refuses it
            $this->assertContains($status, [409, 422, 429], 'quantity '.json_encode($quantity));
        }
        // two lines of the same piece that together exceed the stock
        $this->assertContains($this->postJson('/api/v1/checkout', $this->checkout(['customer' => ['name' => 'Rina', 'phone' => '01612345678'], 'items' => [['variant_id' => $this->variant->id, 'quantity' => 6], ['variant_id' => $this->variant->id, 'quantity' => 6]]]))->status(), [409, 422]);
        // someone else's variant id types
        foreach ([[1], 'abc', -1, 999999] as $id) {
            $this->assertContains($this->postJson('/api/v1/checkout', $this->checkout(['customer' => ['name' => 'Rina', 'phone' => '01512345678'], 'items' => [['variant_id' => $id, 'quantity' => 1]]]))->status(), [422, 429]);
        }

        $this->assertSame($before, [$this->variant->refresh()->stock_on_hand, $this->variant->stock_reserved, Order::query()->count()]);
    }

    #[Test]
    public function e6_hidden_or_switched_off_products_cannot_be_bought_on_the_website(): void
    {
        $draft = ProductVariant::factory()->for(Product::factory()->draft())->withStock(5)->create();
        $off = ProductVariant::factory()->for(Product::factory())->withStock(5)->create(['is_active' => false]);

        foreach ([$draft, $off] as $variant) {
            $this->assertContains($this->postJson('/api/v1/checkout', $this->checkout(['items' => [['variant_id' => $variant->id, 'quantity' => 1]]]))->status(), [409, 422]);
        }
        $this->assertSame(1, Order::query()->count());
    }

    #[Test]
    public function e7_the_buyer_cannot_set_prices_totals_status_or_payment_state(): void
    {
        $response = $this->postJson('/api/v1/checkout', $this->checkout([
            'items' => [['variant_id' => $this->variant->id, 'quantity' => 1, 'unit_price' => '1', 'price' => '1', 'line_total' => '1']],
            'grand_total' => '1', 'items_subtotal' => '1', 'delivery_charge' => '0', 'coupon_discount' => '999', 'manual_discount' => '999',
            'status' => 'delivered', 'payment_status' => 'paid', 'channel' => 'physical_store', 'created_by' => $this->owner->id, 'cogs_total' => '0',
        ]))->assertCreated();

        $order = Order::query()->latest('id')->firstOrFail();
        $this->assertSame(['1070.00', '0.00', '0.00', 'pending', 'unpaid', 'website', null], [$order->grand_total, $order->coupon_discount, $order->manual_discount, $order->status->value, $order->payment_status->value, $order->channel->value, $order->created_by]);
        $this->assertArrayNotHasKey('cogs_total', $response->json('data'));
    }

    #[Test]
    public function e8_payment_and_refund_amounts_in_strange_formats_are_refused(): void
    {
        $this->actingAs($this->owner);
        foreach (['1e2', '0x10', '100.005', '-0.01', '0', ' ', 'NaN', 'Infinity', [100], '1,000', '১০০'] as $amount) {
            $this->assertSame(422, $this->postJson("/api/v1/admin/orders/{$this->order->id}/payments", ['method' => 'cash', 'amount' => $amount])->status(), 'payment '.json_encode($amount));
        }
        $this->assertSame(0, Payment::query()->count());

        // nothing has been paid, so nothing can be refunded
        $this->postJson("/api/v1/admin/orders/{$this->order->id}/refunds", ['amount' => '1', 'method' => 'cash'])->assertUnprocessable();
        // pay in full, then try to refund more than was paid, in one go and in two halves
        $this->postJson("/api/v1/admin/orders/{$this->order->id}/payments", ['method' => 'cash', 'amount' => '1070'])->assertCreated();
        $this->postJson("/api/v1/admin/orders/{$this->order->id}/refunds", ['amount' => '1070.01', 'method' => 'cash'])->assertUnprocessable();
        $this->postJson("/api/v1/admin/orders/{$this->order->id}/refunds", ['amount' => '1000', 'method' => 'cash'])->assertCreated();
        $this->postJson("/api/v1/admin/orders/{$this->order->id}/refunds", ['amount' => '100', 'method' => 'cash'])->assertUnprocessable();
        $this->assertSame('1000.00', Payment::query()->where('type', 'refund')->sum('amount') == 1000 ? '1000.00' : 'over-refunded');
    }

    #[Test]
    public function e9_staff_cannot_sneak_a_below_cost_sale_through_quantity_or_discount_tricks(): void
    {
        $this->actingAs($this->staff);
        $sale = fn (array $override) => $this->postJson('/api/v1/admin/manual-sales', array_merge(['channel' => 'whatsapp', 'status' => 'delivered', 'items' => [['variant_id' => $this->variant->id, 'quantity' => 1]], 'payment' => ['method' => 'cash']], $override));

        $sale(['items' => [['variant_id' => $this->variant->id, 'quantity' => 1, 'unit_price' => '-500']]])->assertUnprocessable();
        $sale(['manual_discount' => '-500'])->assertUnprocessable();
        $sale(['items' => [['variant_id' => $this->variant->id, 'quantity' => 3, 'unit_price' => '10']]])->assertUnprocessable();
        $sale(['manual_discount' => '999'])->assertUnprocessable();
        $sale(['created_by' => $this->owner->id, 'cogs_total' => '0'])->assertCreated();
        $this->assertSame($this->staff->id, Order::query()->latest('id')->value('created_by'), 'cannot pretend the owner made the sale');
    }

    // ───────────── 4. retries, replays and races ─────────────

    #[Test]
    public function e10_idempotency_keys_cannot_replay_someone_elses_answer(): void
    {
        $payload = ['channel' => 'whatsapp', 'status' => 'delivered', 'items' => [['variant_id' => $this->variant->id, 'quantity' => 1]], 'payment' => ['method' => 'cash']];

        $this->actingAs($this->owner)->postJson('/api/v1/admin/manual-sales', $payload, ['Idempotency-Key' => 'shared-key'])->assertCreated();
        app('auth')->forgetGuards();
        // the same key from another account is a new request, not a copy of the owner's sale
        $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', $payload, ['Idempotency-Key' => 'shared-key'])->assertCreated()->assertHeaderMissing('Idempotent-Replayed');
        // the same key on another address is not replayed either
        app('auth')->forgetGuards();
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$this->order->id}/notes", ['body' => 'x'], ['Idempotency-Key' => 'shared-key'])->assertOk()->assertHeaderMissing('Idempotent-Replayed');
        // an absurdly long key is ignored (works as a normal request)
        $this->actingAs($this->owner)->postJson('/api/v1/admin/manual-sales', $payload, ['Idempotency-Key' => str_repeat('k', 5000)])->assertCreated();
        $this->assertSame(4, Order::query()->count());
    }

    #[Test]
    public function e11_a_guest_checkout_key_never_returns_another_customers_order(): void
    {
        $this->postJson('/api/v1/checkout', $this->checkout(), ['Idempotency-Key' => 'guess-me'])->assertCreated();
        // another visitor behind a different address using the same key gets their own order
        $other = $this->withServerVariables(['REMOTE_ADDR' => '10.9.8.7'])->postJson('/api/v1/checkout', $this->checkout(['customer' => ['name' => 'Other', 'phone' => '01812345678']]), ['Idempotency-Key' => 'guess-me']);
        $other->assertCreated()->assertHeaderMissing('Idempotent-Replayed');
        $this->assertSame('Other', $other->json('data.customer_name') ?? Order::query()->latest('id')->value('customer_name'));
    }

    #[Test]
    public function e12_one_coupon_with_a_limit_of_one_cannot_be_used_twice_by_writing_the_phone_differently(): void
    {
        // the per-phone checkout limit would also stop this; switch it off to test the coupon rule alone
        $this->withoutMiddleware(ThrottleRequests::class);
        Coupon::factory()->create(['code' => 'ONCE', 'type' => 'fixed', 'value' => '100', 'per_phone_limit' => 1]);

        $this->postJson('/api/v1/checkout', $this->checkout(['coupon_code' => 'ONCE', 'customer' => ['name' => 'Asha', 'phone' => '01912345678']]))->assertCreated();
        foreach (['+8801912345678', '8801912345678', '01912-345678', ' 01912 345 678 ', 'once'] as $variantPhone) {
            $phone = $variantPhone === 'once' ? '01912345678' : $variantPhone;
            $code = $variantPhone === 'once' ? 'once' : 'ONCE';
            $this->postJson('/api/v1/checkout', $this->checkout(['coupon_code' => $code, 'customer' => ['name' => 'Asha', 'phone' => $phone]]))->assertUnprocessable();
        }
    }

    // ───────────── 5. private data ─────────────

    #[Test]
    public function e13_order_tracking_needs_the_matching_phone_and_gives_no_hint(): void
    {
        $right = $this->postJson('/api/v1/orders/track', ['order_number' => $this->order->order_number, 'phone' => '01712345678']);
        $right->assertOk();
        $wrongPhone = $this->postJson('/api/v1/orders/track', ['order_number' => $this->order->order_number, 'phone' => '01799999999']);
        $wrongOrder = $this->postJson('/api/v1/orders/track', ['order_number' => 'NK999999', 'phone' => '01712345678']);
        $this->assertSame($wrongPhone->status(), $wrongOrder->status(), 'same answer whether the order exists or not');
        $this->assertNotSame(200, $wrongPhone->status());

        // the private order link is a long random id, not the order number
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', (string) $this->order->uuid);
        $this->getJson('/api/v1/orders/'.$this->order->id)->assertNotFound();
        $this->getJson('/api/v1/orders/'.$this->order->order_number)->assertNotFound();
    }

    #[Test]
    public function e14_public_answers_never_carry_costs_or_other_customers(): void
    {
        $text = $this->getJson('/api/v1/products')->getContent().$this->getJson('/api/v1/home')->getContent().$this->getJson('/api/v1/settings')->getContent()
            .$this->getJson('/api/v1/orders/'.$this->order->uuid)->getContent();
        foreach (['total_cost', 'raw_material_cost', 'labour_cost', 'cogs', 'unit_cost', 'password', 'remember_token', 'staff_max_discount_percent', 'sms_enabled', 'order_notification_email', 'ip_address'] as $secret) {
            $this->assertStringNotContainsString($secret, $text, $secret);
        }
    }

    #[Test]
    public function e15_the_activity_log_never_stores_passwords(): void
    {
        $this->actingAs($this->owner)->postJson('/api/v1/admin/users', ['name' => 'New Staff', 'email' => 'new@example.com', 'password' => 'VerySecret123!', 'password_confirmation' => 'VerySecret123!', 'role' => 'staff']);
        $user = User::query()->where('email', 'new@example.com')->first();
        if ($user) {
            $this->patchJson("/api/v1/admin/users/{$user->id}", ['password' => 'OtherSecret456!', 'password_confirmation' => 'OtherSecret456!']);
        }
        $all = ActivityLog::query()->get()->toJson();
        $this->assertStringNotContainsString('VerySecret', $all);
        $this->assertStringNotContainsString('OtherSecret', $all);
        $this->assertStringNotContainsString('$2y$', $all, 'no password hash either');
    }

    // ───────────── 6. exports, files and paths ─────────────

    #[Test]
    public function e16_export_names_and_dates_cannot_be_used_to_reach_other_files(): void
    {
        $this->actingAs($this->owner);
        foreach (['..', '..%2F..%2F.env', '.env', 'users', 'orders.php', 'ORDERS', 'orders%00'] as $type) {
            $this->assertContains($this->get('/api/v1/admin/exports/'.$type)->status(), [404, 405], $type);
        }
        $this->getJson('/api/v1/admin/exports/orders?from=1900-01-01&to=2026-11-24')->assertStatus(422);
        $this->getJson('/api/v1/admin/exports/orders?from=not-a-date')->assertUnprocessable();
    }

    #[Test]
    public function e17_spreadsheet_formulas_are_neutralised_in_every_text_column(): void
    {
        Customer::query()->update(['name' => '@SUM(1+1)']);
        $this->order->update(['shipping_address' => "\t=cmd|' /C calc'!A0", 'customer_name' => '+HYPERLINK("http://evil")']);
        $this->actingAs($this->owner);

        foreach (['orders', 'customers'] as $type) {
            $csv = $this->get("/api/v1/admin/exports/{$type}")->streamedContent();
            foreach (preg_split('/\r?\n/', $csv) as $line) {
                foreach (str_getcsv($line, escape: '') as $cell) {
                    $this->assertDoesNotMatchRegularExpression('/^[=+@\t\r]/', (string) $cell, "{$type}: {$cell}");
                }
            }
        }
    }

    #[Test]
    public function e18_daily_closing_refuses_the_future_and_silly_counts(): void
    {
        $this->actingAs($this->owner);
        $this->postJson('/api/v1/admin/closing', ['date' => now()->addDay()->toDateString(), 'method' => 'cash', 'counted' => '1'])->assertUnprocessable();
        $this->postJson('/api/v1/admin/closing', ['date' => now()->toDateString(), 'method' => 'crypto', 'counted' => '1'])->assertUnprocessable();
        $this->postJson('/api/v1/admin/closing', ['date' => now()->toDateString(), 'method' => 'cash', 'counted' => '1e9'])->assertUnprocessable();
        $this->postJson('/api/v1/admin/closing', ['date' => now()->toDateString(), 'method' => 'cash', 'counted' => '100', 'expected' => '100', 'difference' => '0'])->assertOk();
        $this->assertDatabaseHas('cash_closings', ['method' => 'cash', 'expected' => '0.00', 'difference' => '100.00']);
    }

    // ───────────── 7. what visitors can post ─────────────

    #[Test]
    public function e19_review_and_contact_forms_reject_bad_input_and_are_rate_limited(): void
    {
        $slug = $this->variant->product->slug;
        foreach ([0, 6, -1, '5; DROP TABLE reviews', [5]] as $rating) {
            // 422 = refused as invalid, 429 = refused by the submission limit (5 an hour)
            $this->assertContains($this->postJson("/api/v1/products/{$slug}/reviews", ['customer_name' => 'Asha', 'rating' => $rating, 'comment' => 'Looks lovely, thank you'])->status(), [422, 429]);
        }
        $this->assertContains($this->postJson('/api/v1/contact', ['name' => str_repeat('A', 5000), 'phone' => '01712345678', 'message' => 'hello there'])->status(), [422, 429]);
        $this->assertSame(0, Review::query()->count(), 'no bad review was saved');

        $codes = [];
        for ($i = 0; $i < 8; $i++) {
            $codes[] = $this->postJson('/api/v1/contact', ['name' => 'Rina', 'phone' => '01712345678', 'message' => "message number {$i} here"])->status();
        }
        $this->assertContains(429, $codes, 'contact form slows down floods');
    }

    #[Test]
    public function e20_coupon_guessing_is_rate_limited(): void
    {
        $codes = [];
        for ($i = 0; $i < 15; $i++) {
            $codes[] = $this->postJson('/api/v1/coupons/apply', ['code' => 'GUESS'.$i, 'items' => [['variant_id' => $this->variant->id, 'quantity' => 1]], 'phone' => '01712345678'])->status();
        }
        $this->assertContains(429, $codes);
    }

    /**
     * @param  array<string, mixed>  $override
     * @return array<string, mixed>
     */
    private function checkout(array $override = []): array
    {
        return array_replace([
            'customer' => ['name' => 'Rina', 'phone' => '01712345678'],
            'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $this->variant->id, 'quantity' => 1]],
            'payment' => ['method' => 'cod'],
        ], $override);
    }
}
