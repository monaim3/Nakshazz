<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\ActivityLog;
use App\Models\DeliveryZone;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\SmsLog;
use App\Models\User;
use App\Services\OrderService;
use App\Services\StoreSettings;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * P1 features: daily closing, receivables, stock value, restock suggestions, staff
 * activity log, CSV export, customer SMS / WhatsApp, security headers, idempotency.
 */
class OperationsFeaturesTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    private DeliveryZone $zone;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(StoreSettingSeeder::class);
        $this->owner = User::factory()->owner()->create();
        $this->staff = User::factory()->create();
        $this->zone = DeliveryZone::factory()->create(['charge' => '70.00']);
    }

    #[Test]
    public function daily_closing_shows_what_came_in_and_saves_the_count(): void
    {
        $order = $this->deliveredCodOrder();

        $this->actingAs($this->owner);
        $day = $order->delivered_at->toDateString();

        $closing = $this->getJson("/api/v1/admin/closing?date={$day}")->assertOk()->json('data');
        $cod = collect($closing['methods'])->firstWhere('method', 'cod');
        $this->assertSame($order->grand_total, $cod['received']);
        $this->assertSame($order->grand_total, $cod['expected']);

        $saved = $this->postJson('/api/v1/admin/closing', ['date' => $day, 'method' => 'cod', 'counted' => '1000.00', 'note' => 'courier paid less'])->assertOk()->json('data');
        $cod = collect($saved['methods'])->firstWhere('method', 'cod');
        $this->assertSame('1000.00', $cod['counted']);
        $this->assertSame(bcsub('1000.00', $order->grand_total, 2), $cod['difference']);

        $this->assertDatabaseHas('activity_logs', ['action' => 'closing.saved', 'user_id' => $this->owner->id]);
    }

    #[Test]
    public function shipped_unpaid_orders_are_listed_as_money_owed(): void
    {
        $order = $this->placeOrder($this->variant(5), 1);
        $orders = app(OrderService::class);
        $orders->transition($order, OrderStatus::Confirmed, $this->owner);
        $orders->transition($order, OrderStatus::Shipped, $this->owner);

        $this->actingAs($this->owner);
        $receivables = $this->getJson('/api/v1/admin/closing')->assertOk()->json('data.receivables');

        $this->assertSame(1, $receivables['count']);
        $this->assertSame($order->grand_total, $receivables['total']);
        $this->assertSame($order->order_number, $receivables['orders'][0]['order_number']);
    }

    #[Test]
    public function staff_cannot_see_closing_restock_activity_or_exports(): void
    {
        $this->actingAs($this->staff);

        $this->getJson('/api/v1/admin/closing')->assertForbidden();
        $this->getJson('/api/v1/admin/restock')->assertForbidden();
        $this->getJson('/api/v1/admin/activity')->assertForbidden();
        $this->get('/api/v1/admin/exports/orders')->assertForbidden();
    }

    #[Test]
    public function stock_value_and_restock_suggestions_follow_sales(): void
    {
        $variant = $this->variant(stock: 4, price: '1000.00');
        $quiet = $this->variant(stock: 50, price: '500.00');

        // 3 sold in the last 30 days → 0.1 a day; 1 left → low stock, suggest cover for 30 days
        $order = $this->placeOrder($variant, 3);
        $orders = app(OrderService::class);
        $orders->transition($order, OrderStatus::Confirmed, $this->owner);
        $orders->transition($order, OrderStatus::Shipped, $this->owner);

        $this->actingAs($this->owner);
        $data = $this->getJson('/api/v1/admin/restock')->assertOk()->json('data');

        $row = collect($data['items'])->firstWhere('variant_id', $variant->id);
        $this->assertNotNull($row);
        $this->assertSame(1, $row['available']);
        $this->assertSame(3, $row['sold_last_days']);
        $this->assertSame(10, $row['days_left']);
        $this->assertSame(2, $row['suggested_quantity']);
        $this->assertNull(collect($data['items'])->firstWhere('variant_id', $quiet->id));

        $variant->refresh();
        $quiet->refresh();
        $this->assertSame(1 + 50, $data['stock_value']['units']);
        $this->assertSame(bcadd(bcmul('1', $variant->total_cost, 2), bcmul('50', $quiet->total_cost, 2), 2), $data['stock_value']['at_cost']);
        $this->assertSame('26000.00', $data['stock_value']['at_price']);

        $dashboard = $this->getJson('/api/v1/admin/dashboard')->assertOk()->json('data');
        $this->assertSame(1, $dashboard['attention']['restock_needed']);
        $this->assertArrayHasKey('stock_value', $dashboard);

        $this->actingAs($this->staff);
        $this->assertArrayNotHasKey('stock_value', $this->getJson('/api/v1/admin/dashboard')->assertOk()->json('data'));
    }

    #[Test]
    public function price_changes_and_order_status_changes_are_logged_with_who_and_what(): void
    {
        $variant = $this->variant(stock: 5, price: '1000.00');
        $this->actingAs($this->staff);

        // an admin change is logged; the same change by the system (no login) is not
        $variant->update(['price' => '1200.00']);
        $log = ActivityLog::query()->where('action', 'variant.price')->sole();
        $this->assertSame($this->staff->id, $log->user_id);
        $this->assertSame(['from' => '1000.00', 'to' => '1200.00'], $log->changes['price']);

        $this->actingAs($this->owner);
        $this->postJson('/api/v1/admin/settings', ['low_stock_threshold' => 7])->assertOk();
        $this->assertDatabaseHas('activity_logs', ['action' => 'settings.updated', 'user_id' => $this->owner->id]);

        $list = $this->getJson('/api/v1/admin/activity?subject_type=variant')->assertOk()->json('data');
        $this->assertCount(1, $list);
        $this->assertSame($this->staff->name, $list[0]['user']['name']);
    }

    #[Test]
    public function export_downloads_csv_with_bom_and_neutralises_formulas(): void
    {
        $order = $this->placeOrder($this->variant(5), 1, name: '=HYPERLINK("x")');
        $this->actingAs($this->owner);

        $response = $this->get('/api/v1/admin/exports/orders')->assertOk();
        $csv = $response->streamedContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $this->assertStringContainsString($order->order_number, $csv);
        $this->assertStringContainsString("'=HYPERLINK", $csv);
        $this->assertStringContainsString('text/csv', $response->headers->get('Content-Type'));

        foreach (['payments', 'expenses', 'inventory', 'customers', 'products', 'restock'] as $type) {
            $this->get("/api/v1/admin/exports/{$type}")->assertOk();
        }
        $this->get('/api/v1/admin/exports/passwords')->assertNotFound();
    }

    #[Test]
    public function customer_gets_one_sms_per_event_when_switched_on(): void
    {
        app(StoreSettings::class)->update(['sms_enabled' => true]);
        $order = $this->placeOrder($this->variant(5), 1);
        $orders = app(OrderService::class);

        $orders->transition($order, OrderStatus::Confirmed, $this->owner);
        $orders->transition($order, OrderStatus::Shipped, $this->owner, ['courier_name' => 'Pathao', 'tracking_code' => 'PT123']);
        $orders->transition($order, OrderStatus::Delivered, $this->owner);

        $this->assertSame(['confirmed', 'shipped'], SmsLog::query()->orderBy('id')->pluck('event')->all());
        $this->assertStringContainsString('PT123', SmsLog::query()->where('event', 'shipped')->value('message'));

        $this->actingAs($this->owner);
        $links = $this->getJson("/api/v1/admin/orders/{$order->id}")->assertOk()->json('data.whatsapp');
        $this->assertStringStartsWith('https://wa.me/8801712345678?text=', $links['shipped']);
    }

    #[Test]
    public function no_sms_when_switched_off(): void
    {
        $order = $this->placeOrder($this->variant(5), 1);
        app(OrderService::class)->transition($order, OrderStatus::Confirmed, $this->owner);

        $this->assertSame(0, SmsLog::query()->count());
    }

    #[Test]
    public function api_answers_carry_security_headers(): void
    {
        $response = $this->getJson('/api/v1/settings');

        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('X-Frame-Options', 'DENY');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->assertHeaderMissing('X-Powered-By');
    }

    #[Test]
    public function a_retried_manual_sale_with_the_same_key_is_made_once(): void
    {
        $variant = $this->variant(5);
        $this->actingAs($this->owner);
        $payload = [
            'channel' => 'whatsapp',
            'status' => 'delivered',
            'items' => [['variant_id' => $variant->id, 'quantity' => 1]],
            'payment' => ['method' => 'cash'],
        ];

        $first = $this->postJson('/api/v1/admin/manual-sales', $payload, ['Idempotency-Key' => 'abc-123'])->assertCreated();
        $second = $this->postJson('/api/v1/admin/manual-sales', $payload, ['Idempotency-Key' => 'abc-123'])->assertCreated();

        $second->assertHeader('Idempotent-Replayed', 'true');
        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertSame(1, Order::query()->count());
    }

    private function variant(int $stock, string $price = '1000.00'): ProductVariant
    {
        return ProductVariant::factory()
            ->for(Product::factory())
            ->state(['price' => $price])
            ->withStock($stock)
            ->create()
            ->refresh();
    }

    private function placeOrder(ProductVariant $variant, int $quantity, string $name = 'Ayesha'): Order
    {
        return app(OrderService::class)->placeWebsiteOrder([
            'customer' => ['name' => $name, 'phone' => '01712345678'],
            'shipping' => ['address' => 'House 12, Road 5', 'area' => 'Dhanmondi', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $variant->id, 'quantity' => $quantity]],
            'coupon_code' => null,
            'payment' => ['method' => 'cod'],
        ], '127.0.0.1');
    }

    private function deliveredCodOrder(): Order
    {
        $order = $this->placeOrder($this->variant(5), 1);
        $orders = app(OrderService::class);
        $orders->transition($order, OrderStatus::Confirmed, $this->owner);
        $orders->transition($order, OrderStatus::Shipped, $this->owner);

        return $orders->transition($order, OrderStatus::Delivered, $this->owner);
    }
}
