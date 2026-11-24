<?php

namespace Tests\Feature\Qa;

use App\Models\Category;
use App\Models\Customer;
use App\Models\DeliveryZone;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\ReportService;
use Carbon\CarbonImmutable;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * QA audit, phase 10: New sale (point of sale for the shop counter, Facebook, WhatsApp...).
 * A "delivered" sale takes stock out at once; a "confirmed" sale reserves it for shipping.
 * Product A ৳1,000 (cost 450).
 */
#[Group('qa')]
class Phase10PosTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    private ProductVariant $a;

    private DeliveryZone $zone;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(StoreSettingSeeder::class);
        $this->owner = User::factory()->owner()->create();
        $this->staff = User::factory()->create();
        $this->zone = DeliveryZone::factory()->create(['charge' => '70.00']);
        $this->a = ProductVariant::factory()->for(Product::factory()->for(Category::factory())->state(['name' => 'Kundan Jhumka']))->withStock(10)->create(['price' => '1000.00', 'is_default' => true, 'sku' => 'KJ-GOLD-01']);
    }

    #[Test]
    public function p1_find_products_by_name_or_sku_with_live_stock(): void
    {
        $this->actingAs($this->staff);
        $this->getJson('/api/v1/admin/products?q=kundan')->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/products?q=KJ-GOLD')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.variants.0.stock_available', 10);
        $this->getJson('/api/v1/admin/products?q=nothing-like-this')->assertJsonPath('meta.total', 0);
    }

    #[Test]
    public function p2_walk_in_cash_sale_updates_stock_payment_reports_at_once(): void
    {
        $id = $this->sale(['items' => [['variant_id' => $this->a->id, 'quantity' => 2]]])
            ->assertCreated()->assertJsonPath('data.status', 'delivered')->assertJsonPath('data.payment_status', 'paid')->assertJsonPath('data.grand_total', '2000.00')->json('data.id');

        $this->assertSame([8, 0], [$this->a->refresh()->stock_on_hand, $this->a->stock_reserved]);
        $this->assertSame(1, InventoryMovement::query()->where('order_id', $id)->where('type', 'sale')->count());
        $this->assertSame($this->staff->id, Order::query()->find($id)->created_by);
        $summary = app(ReportService::class)->summary(CarbonImmutable::today(), CarbonImmutable::today())['realized'];
        $this->assertSame(['2000.00', '900.00'], [$summary['product_revenue'], $summary['cogs']]);
        $channels = collect(app(ReportService::class)->byChannel(CarbonImmutable::today(), CarbonImmutable::today()))->keyBy('channel');
        $this->assertSame('2000.00', $channels['physical_store']['product_revenue']);
    }

    #[Test]
    public function p3_existing_customer_by_phone_and_bkash_with_trxid(): void
    {
        $existing = Customer::factory()->create(['phone' => '01712345678', 'name' => 'Rina']);
        $this->sale(['customer' => ['phone' => '+8801712345678'], 'payment' => ['method' => 'bkash', 'transaction_id' => 'POS00000001', 'sender_number' => '01712345678']])
            ->assertCreated()->assertJsonPath('data.customer_id', $existing->id)->assertJsonPath('data.payment_status', 'paid');

        $this->sale(['payment' => ['method' => 'bkash', 'transaction_id' => 'pos00000001']])->assertJsonValidationErrors('payment.transaction_id');
        $this->assertSame(9, $this->a->refresh()->stock_on_hand, 'the refused sale took no stock');
        $this->assertSame('Rina', $existing->refresh()->name, 'no name typed → name kept');
    }

    #[Test]
    public function p4_sale_to_ship_needs_address_and_reserves_then_can_be_cancelled(): void
    {
        $this->sale(['status' => 'confirmed', 'channel' => 'facebook'])->assertJsonValidationErrors(['customer.phone', 'shipping.address', 'shipping.city']);

        $id = $this->sale([
            'status' => 'confirmed', 'channel' => 'facebook',
            'customer' => ['name' => 'FB buyer', 'phone' => '01812345678'],
            'shipping' => ['address' => 'House 4, Road 7', 'city' => 'Khulna', 'delivery_zone_id' => $this->zone->id],
            'payment' => ['method' => 'cod'],
        ])->assertCreated()->assertJsonPath('data.grand_total', '1070.00')->assertJsonPath('data.payment_status', 'unpaid')->json('data.id');

        $this->assertSame([10, 1], [$this->a->refresh()->stock_on_hand, $this->a->stock_reserved]);
        $this->actingAs($this->staff)->postJson("/api/v1/admin/orders/{$id}/status", ['status' => 'cancelled'])->assertOk();
        $this->assertSame([10, 0], [$this->a->refresh()->stock_on_hand, $this->a->stock_reserved]);
    }

    #[Test]
    public function p5_no_stock_means_no_sale_unless_made_to_order(): void
    {
        $this->a->forceFill(['stock_on_hand' => 0])->save();
        $this->sale([])->assertStatus(409);

        $this->a->update(['allow_backorder' => true]);
        $this->sale([])->assertCreated();
        $this->assertSame(-1, $this->a->refresh()->stock_on_hand);
    }

    #[Test]
    public function p6_completed_counter_sale_is_returned_and_refunded_by_the_owner_only(): void
    {
        $order = Order::query()->findOrFail($this->sale(['items' => [['variant_id' => $this->a->id, 'quantity' => 2]]])->assertCreated()->json('data.id'));
        $item = $order->items()->firstOrFail();

        $this->actingAs($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => 'cancelled'])->assertStatus(409);
        $this->actingAs($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/returns", ['items' => [['order_item_id' => $item->id, 'quantity' => 1]], 'refund' => ['amount' => '1000', 'method' => 'cash']])->assertForbidden();
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/returns", ['items' => [['order_item_id' => $item->id, 'quantity' => 1]], 'refund' => ['amount' => '1000', 'method' => 'cash']])->assertOk();

        $this->assertSame(9, $this->a->refresh()->stock_on_hand);
        $this->assertSame('partially_refunded', $order->refresh()->payment_status->value);
        $this->assertSame('1000.00', app(ReportService::class)->summary(CarbonImmutable::today(), CarbonImmutable::today())['realized']['product_revenue']);
    }

    #[Test]
    public function p7_partial_payment_and_extra_payment_later_split_over_two_methods(): void
    {
        $id = $this->sale(['payment' => ['method' => 'cash', 'amount' => '600']])->assertCreated()->assertJsonPath('data.payment_status', 'partially_paid')->json('data.id');
        $this->actingAs($this->staff)->postJson("/api/v1/admin/orders/{$id}/payments", ['method' => 'bkash', 'amount' => '400', 'transaction_id' => 'SPLIT000001'])->assertCreated();
        $this->assertSame('paid', Order::query()->find($id)->payment_status->value);

        // paying more than the total at the counter is capped at the total
        $over = $this->sale(['payment' => ['method' => 'cash', 'amount' => '5000']])->assertCreated()->json('data.id');
        $this->assertSame('1000.00', Order::query()->find($over)->payments()->value('amount'));
    }

    #[Test]
    public function p8_fixed_staff_cannot_sell_below_cost_or_past_the_discount_limit(): void
    {
        // FIXED (my call 1): below cost is refused for staff, and so is more than the owner's max discount (20%)
        $this->sale(['items' => [['variant_id' => $this->a->id, 'quantity' => 1, 'unit_price' => '0']]])->assertJsonValidationErrors('items.0.unit_price');
        $this->sale(['items' => [['variant_id' => $this->a->id, 'quantity' => 1, 'unit_price' => '100']]])->assertJsonValidationErrors('items.0.unit_price');
        $this->sale(['items' => [['variant_id' => $this->a->id, 'quantity' => 1, 'unit_price' => '750']]])->assertUnprocessable();
        $this->assertStringNotContainsString('450', $this->sale(['items' => [['variant_id' => $this->a->id, 'quantity' => 1, 'unit_price' => '100']]])->json('message'), 'the message never tells staff the cost');
        $this->assertSame(10, $this->a->refresh()->stock_on_hand, 'refused sales took no stock');

        // inside the limit is fine; the owner may still give a piece away
        $this->sale(['items' => [['variant_id' => $this->a->id, 'quantity' => 1, 'unit_price' => '850']]])->assertCreated();
        $free = $this->actingAs($this->owner)->postJson('/api/v1/admin/manual-sales', [
            'channel' => 'physical_store', 'status' => 'delivered',
            'items' => [['variant_id' => $this->a->id, 'quantity' => 1, 'unit_price' => '0']],
            'payment' => ['method' => 'cash'],
        ])->assertCreated()->json('data');
        $this->assertSame('0.00', $free['grand_total']);
    }

    #[Test]
    public function p9_fixed_a_counter_sale_cannot_be_filed_under_the_website_channel(): void
    {
        $this->sale(['channel' => 'website'])->assertJsonValidationErrors('channel');
        $this->assertSame(0, Order::query()->count());
    }

    #[Test]
    public function p10_fixed_the_same_sale_retried_with_one_key_is_recorded_once(): void
    {
        // two separate sales (no key) are still two sales
        $this->sale([])->assertCreated();
        $this->sale([])->assertCreated();
        $this->assertSame(8, $this->a->refresh()->stock_on_hand);

        // a retry of one attempt carries the same Idempotency-Key and is done once
        $payload = ['channel' => 'physical_store', 'status' => 'delivered', 'items' => [['variant_id' => $this->a->id, 'quantity' => 1]], 'payment' => ['method' => 'cash']];
        $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', $payload, ['Idempotency-Key' => 'tap-1'])->assertCreated();
        $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', $payload, ['Idempotency-Key' => 'tap-1'])->assertCreated()->assertHeader('Idempotent-Replayed', 'true');
        $this->assertSame(7, $this->a->refresh()->stock_on_hand);
    }

    #[Test]
    public function p11_draft_products_can_be_sold_at_the_counter_archived_cannot(): void
    {
        $this->a->product->update(['status' => 'draft']);
        $this->sale([])->assertCreated();
        $this->a->product->update(['status' => 'archived']);
        $this->sale([])->assertJsonValidationErrors('items.0.variant_id');
    }

    /** @param array<string, mixed> $override */
    private function sale(array $override): TestResponse
    {
        return $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', array_merge([
            'channel' => 'physical_store', 'status' => 'delivered',
            'items' => [['variant_id' => $this->a->id, 'quantity' => 1]],
            'payment' => ['method' => 'cash'],
        ], $override));
    }
}
