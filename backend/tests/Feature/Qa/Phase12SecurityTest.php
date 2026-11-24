<?php

namespace Tests\Feature\Qa;

use App\Models\Category;
use App\Models\Coupon;
use App\Models\DeliveryZone;
use App\Models\Expense;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\OrderService;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * QA audit, phase 12: staff permissions and security.
 * Roles: owner (everything) and staff (day-to-day: orders, New sale, bKash checks, stock,
 * products without costs, customers, content, messages, reviews). Hiding a button is not
 * security, so every check here goes straight to the API.
 */
#[Group('qa')]
class Phase12SecurityTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(StoreSettingSeeder::class);
        Storage::fake('public');
        Storage::fake('local');
        $this->owner = User::factory()->owner()->create(['email' => 'owner@example.com']);
        $this->staff = User::factory()->create(['email' => 'staff@example.com']);
        $zone = DeliveryZone::factory()->create(['charge' => '70.00']);
        $variant = ProductVariant::factory()->for(Product::factory()->for(Category::factory()))->withStock(10)->create(['price' => '1000.00', 'is_default' => true]);
        $this->order = app(OrderService::class)->placeWebsiteOrder([
            'customer' => ['name' => 'Rina', 'phone' => '01712345678'],
            'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $zone->id],
            'items' => [['variant_id' => $variant->id, 'quantity' => 1]],
            'payment' => ['method' => 'cod'],
        ]);
    }

    #[Test]
    public function s1_staff_is_refused_every_owner_only_action(): void
    {
        $coupon = Coupon::factory()->create();
        $expense = Expense::factory()->create();
        $zone = DeliveryZone::query()->firstOrFail();
        $owner = [
            ['get', '/api/v1/admin/reports/summary'], ['get', '/api/v1/admin/reports/channels'], ['get', '/api/v1/admin/reports/products'], ['get', '/api/v1/admin/reports/monthly'],
            ['get', '/api/v1/admin/expenses'], ['post', '/api/v1/admin/expenses'], ['post', "/api/v1/admin/expenses/{$expense->id}"], ['delete', "/api/v1/admin/expenses/{$expense->id}"], ['get', "/api/v1/admin/expenses/{$expense->id}/attachment"],
            ['get', '/api/v1/admin/expense-categories'],
            ['get', '/api/v1/admin/coupons'], ['post', '/api/v1/admin/coupons'], ['patch', "/api/v1/admin/coupons/{$coupon->id}"], ['delete', "/api/v1/admin/coupons/{$coupon->id}"],
            ['get', '/api/v1/admin/settings'], ['post', '/api/v1/admin/settings'], ['post', '/api/v1/admin/delivery-zones'], ['patch', "/api/v1/admin/delivery-zones/{$zone->id}"],
            ['get', '/api/v1/admin/users'], ['post', '/api/v1/admin/users'], ['patch', "/api/v1/admin/users/{$this->owner->id}"],
            ['post', "/api/v1/admin/orders/{$this->order->id}/refunds"],
        ];

        foreach ($owner as [$method, $url]) {
            $this->actingAs($this->staff)->json($method, $url, ['amount' => '1', 'method' => 'cash'])->assertForbidden();
            $this->assertSame(403, $this->actingAs($this->staff)->json($method, $url)->status(), "staff {$method} {$url}");
        }
        $this->assertSame('৳1,000 never changed', Expense::query()->count() === 1 && Coupon::query()->count() === 1 ? '৳1,000 never changed' : 'changed');
    }

    #[Test]
    public function s2_guests_and_switched_off_accounts_get_nothing(): void
    {
        foreach (['/api/v1/admin/me', '/api/v1/admin/orders', "/api/v1/admin/orders/{$this->order->id}", '/api/v1/admin/customers', '/api/v1/admin/alerts', '/api/v1/admin/inventory'] as $url) {
            $this->getJson($url)->assertUnauthorized();
        }
        $this->staff->update(['is_active' => false]);
        $this->actingAs($this->staff)->getJson('/api/v1/admin/orders')->assertForbidden();
        $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/v1/admin/login', ['email' => 'staff@example.com', 'password' => 'password'])->assertStatus(422);
    }

    #[Test]
    public function s3_no_one_can_lock_the_shop_out_of_its_owner_account(): void
    {
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/users/{$this->owner->id}", ['role' => 'staff'])->assertForbidden();
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/users/{$this->owner->id}", ['is_active' => false])->assertForbidden();
        $this->actingAs($this->staff)->patchJson("/api/v1/admin/users/{$this->staff->id}", ['role' => 'owner'])->assertForbidden();
        $this->assertSame('staff', $this->staff->refresh()->role->value);

        $this->actingAs($this->owner)->postJson('/api/v1/admin/users', ['name' => 'New', 'email' => 'new@example.com', 'password' => 'short1', 'role' => 'staff'])->assertJsonValidationErrors('password');
        $this->actingAs($this->owner)->postJson('/api/v1/admin/users', ['name' => 'New', 'email' => 'new@example.com', 'password' => 'onlyletters', 'role' => 'staff'])->assertJsonValidationErrors('password');
        $this->actingAs($this->owner)->postJson('/api/v1/admin/users', ['name' => 'New', 'email' => 'new@example.com', 'password' => 'Jhumka2026x', 'role' => 'staff'])->assertCreated()->assertJsonMissingPath('data.password');
        $this->actingAs($this->owner)->getJson('/api/v1/admin/users')->assertOk()->assertJsonMissingPath('data.0.password')->assertJsonMissingPath('data.0.remember_token');
    }

    #[Test]
    public function s4_login_gives_nothing_away_and_slows_down_guessing(): void
    {
        $wrongPassword = $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/v1/admin/login', ['email' => 'owner@example.com', 'password' => 'nope'])->assertStatus(422)->json('errors.email.0');
        $unknownUser = $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/v1/admin/login', ['email' => 'nobody@example.com', 'password' => 'nope'])->assertStatus(422)->json('errors.email.0');
        $this->assertSame($wrongPassword, $unknownUser, 'same message: cannot find out which emails exist');

        foreach (range(1, 4) as $i) {
            $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/v1/admin/login', ['email' => 'owner@example.com', 'password' => "guess{$i}"]);
        }
        $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/v1/admin/login', ['email' => 'owner@example.com', 'password' => 'password'])->assertTooManyRequests();
    }

    #[Test]
    public function s5_browser_tampering_with_prices_totals_and_quantities_is_ignored(): void
    {
        $variant = ProductVariant::query()->firstOrFail();
        $zone = DeliveryZone::query()->firstOrFail();
        $data = $this->postJson('/api/v1/checkout', [
            'customer' => ['name' => 'Hacker', 'phone' => '01812345678'],
            'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $zone->id],
            'items' => [['variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => '1', 'price' => '1']],
            'payment' => ['method' => 'cod', 'amount' => '1'],
            'manual_discount' => '999', 'delivery_charge' => '0', 'grand_total' => '1', 'coupon_discount' => '999', 'status' => 'delivered', 'payment_status' => 'paid',
        ])->assertCreated()->json('data');

        $this->assertSame(['1070.00', 'pending', 'unpaid'], [$data['totals']['grand_total'], $data['status'], $data['payment_status']]);

        // staff editing shipping cannot slip in money or status fields
        $this->actingAs($this->staff)->patchJson("/api/v1/admin/orders/{$this->order->id}/shipping", ['shipping_city' => 'Gazipur', 'grand_total' => '1', 'status' => 'delivered', 'payment_status' => 'paid'])->assertOk();
        $this->order->refresh();
        $this->assertSame(['Gazipur', '1070.00', 'pending', 'unpaid'], [$this->order->shipping_city, $this->order->grand_total, $this->order->status->value, $this->order->payment_status->value]);

        $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', ['channel' => 'physical_store', 'status' => 'delivered', 'items' => [['variant_id' => $variant->id, 'quantity' => -3]], 'payment' => ['method' => 'cash']])->assertJsonValidationErrors('items.0.quantity');
    }

    #[Test]
    public function s6_injection_style_input_is_treated_as_plain_text(): void
    {
        $this->actingAs($this->owner);
        foreach (["' OR 1=1 --", '"; DROP TABLE orders; --', '%', '_', '\\', '<script>alert(1)</script>'] as $evil) {
            $this->getJson('/api/v1/admin/orders?q='.urlencode($evil))->assertOk()->assertJsonPath('meta.total', 0);
            $this->getJson('/api/v1/admin/customers?q='.urlencode($evil))->assertOk()->assertJsonPath('meta.total', 0);
            $this->getJson('/api/v1/admin/products?q='.urlencode($evil))->assertOk();
            $this->getJson('/api/v1/products?q='.urlencode($evil))->assertOk();
        }
        $this->getJson('/api/v1/products?sort='.urlencode('price; DROP TABLE products'))->assertJsonValidationErrors('sort');
        $this->getJson('/api/v1/admin/orders?status='.urlencode("pending' OR '1'='1"))->assertJsonValidationErrors('status');
        $this->assertSame(1, Order::query()->count());

        // stored as typed; the shop and admin print it as text (React escapes it; the only raw HTML is the product JSON-LD, which escapes "<")
        $this->postJson('/api/v1/contact', ['name' => '<img src=x onerror=alert(1)>', 'phone' => '01712345678', 'message' => '<script>alert("x")</script> hello there'])->assertCreated();
        // the server also strips tags from contact messages and reviews before saving (defence in depth)
        $message = $this->getJson('/api/v1/admin/messages')->json('data.0');
        $this->assertStringNotContainsString('<', $message['name'].$message['message']);
        // OBS-23: a name made only of tags is saved empty although a name is required
        $this->assertSame('', $message['name']);
    }

    #[Test]
    public function s7_harmful_uploads_are_refused_and_images_are_rebuilt(): void
    {
        $product = Product::query()->firstOrFail();
        $this->actingAs($this->owner);
        $upload = fn (UploadedFile $file) => $this->post("/api/v1/admin/products/{$product->id}/images", ['images' => [$file]], ['Accept' => 'application/json']);

        $upload(UploadedFile::fake()->createWithContent('shell.php.jpg', '<?php system($_GET["c"]); ?>'))->assertUnprocessable();
        $upload(UploadedFile::fake()->createWithContent('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))->assertUnprocessable();
        $upload(UploadedFile::fake()->createWithContent('page.html', '<html><script>alert(1)</script></html>'))->assertUnprocessable();
        $upload(UploadedFile::fake()->image('real.png', 800, 800))->assertSuccessful();

        $stored = Storage::disk('public')->allFiles();
        $this->assertNotEmpty($stored);
        $this->assertSame([], array_values(array_filter($stored, fn ($path) => ! str_ends_with($path, '.webp'))), 'every stored image was re-encoded to WebP');

        $this->post('/api/v1/admin/expenses', ['expense_category_id' => Expense::factory()->create()->expense_category_id, 'title' => 'Bill', 'amount' => '10', 'expense_date' => now()->toDateString(), 'attachment' => UploadedFile::fake()->createWithContent('bill.pdf.php', '<?php echo 1; ?>')], ['Accept' => 'application/json'])
            ->assertJsonValidationErrors('attachment');
    }

    #[Test]
    public function s8_public_answers_hold_no_private_data(): void
    {
        $settings = $this->getJson('/api/v1/settings')->assertOk()->getContent();
        foreach (['password', 'secret', 'api_key', 'storefront_key', 'smtp', 'token'] as $word) {
            $this->assertStringNotContainsStringIgnoringCase($word, $settings, "settings: {$word}");
        }

        $product = $this->getJson('/api/v1/products/'.Product::query()->value('slug'))->assertOk()->getContent();
        foreach (['raw_material_cost', 'labour_cost', 'unit_cost', 'stock_on_hand', 'stock_reserved'] as $field) {
            $this->assertStringNotContainsString($field, $product, "product: {$field}");
        }

        $tracked = $this->getJson("/api/v1/orders/{$this->order->uuid}")->assertOk()->getContent();
        foreach (['ip_address', 'unit_cost', 'cogs', '01712345678', 'House 1'] as $secret) {
            $this->assertStringNotContainsString($secret, $tracked, "order page: {$secret}");
        }
        $this->getJson("/api/v1/orders/{$this->order->id}")->assertNotFound(); // the plain order id cannot be used
    }

    #[Test]
    public function s9_errors_never_show_code_or_stack_traces_when_debug_is_off(): void
    {
        config(['app.debug' => false]);
        $body = $this->postJson('/api/v1/checkout', ['items' => 'not-an-array'])->getContent();
        $missing = $this->getJson('/api/v1/products/no-such-product')->assertNotFound()->getContent();

        foreach ([$body, $missing] as $text) {
            $this->assertStringNotContainsString('vendor/laravel', $text);
            $this->assertStringNotContainsString('"trace"', $text);
            $this->assertStringNotContainsString('SQLSTATE', $text);
        }
    }
}
