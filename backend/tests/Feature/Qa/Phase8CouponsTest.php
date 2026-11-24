<?php

namespace Tests\Feature\Qa;

use App\Models\Category;
use App\Models\Coupon;
use App\Models\DeliveryZone;
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
 * QA audit, phase 8: coupons and discounts.
 * Supported: fixed / percent, max discount, minimum order, start / end time, total use
 * limit, per-phone limit, active switch. Not supported (N/A): product- or category-specific
 * coupons, stacking two coupons.
 */
#[Group('qa')]
class Phase8CouponsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    private DeliveryZone $zone;

    private ProductVariant $variant;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(StoreSettingSeeder::class);
        $this->owner = User::factory()->owner()->create();
        $this->staff = User::factory()->create();
        $this->zone = DeliveryZone::factory()->create(['charge' => '70.00']);
        $this->variant = ProductVariant::factory()->for(Product::factory()->for(Category::factory()))->withStock(500)->create(['price' => '1000.00', 'is_default' => true]);
    }

    #[Test]
    public function k1_admin_creates_edits_and_validates_coupons(): void
    {
        $this->actingAs($this->owner);
        $this->postJson('/api/v1/admin/coupons', ['code' => ' eid-25 ', 'type' => 'percent', 'value' => '25'])->assertCreated()->assertJsonPath('data.code', 'EID-25');
        $this->postJson('/api/v1/admin/coupons', ['code' => 'Eid-25', 'type' => 'fixed', 'value' => '10'])->assertJsonValidationErrors('code');
        $this->postJson('/api/v1/admin/coupons', ['code' => 'BIG', 'type' => 'percent', 'value' => '101'])->assertJsonValidationErrors('value');
        $this->postJson('/api/v1/admin/coupons', ['code' => 'NEG', 'type' => 'fixed', 'value' => '-50'])->assertJsonValidationErrors('value');
        $this->postJson('/api/v1/admin/coupons', ['code' => 'ZERO', 'type' => 'fixed', 'value' => '0'])->assertJsonValidationErrors('value');
        $this->postJson('/api/v1/admin/coupons', ['code' => 'BAD CODE!', 'type' => 'fixed', 'value' => '10'])->assertJsonValidationErrors('code');
        $this->postJson('/api/v1/admin/coupons', ['code' => 'BACKWARDS', 'type' => 'fixed', 'value' => '10', 'starts_at' => '2026-12-10 00:00', 'expires_at' => '2026-12-01 00:00'])->assertJsonValidationErrors('expires_at');
        $this->postJson('/api/v1/admin/coupons', ['code' => 'LIMIT0', 'type' => 'fixed', 'value' => '10', 'usage_limit' => 0])->assertJsonValidationErrors('usage_limit');
    }

    #[Test]
    public function k2_editing_only_the_end_date_of_a_scheduled_coupon_works(): void
    {
        $coupon = Coupon::factory()->create(['code' => 'SCHED', 'starts_at' => now()->addDay(), 'expires_at' => now()->addDays(10)]);

        // the admin form sends every field; only the end date changes
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/coupons/{$coupon->id}", [
            'code' => 'SCHED', 'type' => 'fixed', 'value' => '100', 'starts_at' => $coupon->starts_at->format('Y-m-d H:i'), 'expires_at' => now()->addDays(20)->format('Y-m-d H:i'), 'is_active' => true,
        ])->assertOk();
        // FIXED OBS-19: a partial update without the code keeps the code
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/coupons/{$coupon->id}", ['is_active' => false])->assertOk();
        $this->assertSame(['SCHED', false], [$coupon->refresh()->code, $coupon->is_active]);
    }

    #[Test]
    public function k3_staff_cannot_touch_coupons(): void
    {
        $this->actingAs($this->staff)->getJson('/api/v1/admin/coupons')->assertForbidden();
        $this->actingAs($this->staff)->postJson('/api/v1/admin/coupons', ['code' => 'STAFF', 'type' => 'fixed', 'value' => '10'])->assertForbidden();
    }

    #[Test]
    public function k4_percent_with_a_cap_fixed_larger_than_the_bag_and_minimum_order(): void
    {
        Coupon::factory()->create(['code' => 'P20CAP', 'type' => 'percent', 'value' => '20', 'max_discount' => '300']);
        Coupon::factory()->create(['code' => 'HUGE', 'type' => 'fixed', 'value' => '5000']);
        Coupon::factory()->create(['code' => 'MIN2000', 'type' => 'fixed', 'value' => '200', 'min_order_amount' => '2000']);

        $this->assertSame(['300.00', '2770.00'], $this->totals('P20CAP', 3), '20% of 3000 = 600, capped at 300; + 70 delivery');
        $this->assertSame(['1000.00', '70.00'], $this->totals('HUGE', 1), 'never more than the items; delivery still paid');
        $this->checkout('MIN2000', 1)->assertJsonValidationErrors('coupon_code');
        $this->assertSame(['200.00', '1870.00'], $this->totals('MIN2000', 2), 'exactly the minimum is enough');
    }

    #[Test]
    public function k5_inactive_future_expired_and_unknown_coupons_are_refused_with_a_reason(): void
    {
        Coupon::factory()->create(['code' => 'OFF', 'is_active' => false]);
        Coupon::factory()->create(['code' => 'SOON', 'starts_at' => now()->addHour()]);
        Coupon::factory()->create(['code' => 'GONE', 'expires_at' => now()->subMinute()]);

        foreach (['OFF' => 'not valid', 'SOON' => 'not active yet', 'GONE' => 'expired', 'NOSUCH' => 'not valid'] as $code => $reason) {
            $message = $this->checkout($code, 1)->assertJsonValidationErrors('coupon_code')->json('errors.coupon_code.0');
            $this->assertStringContainsString($reason, $message, $code);
            $preview = $this->postJson('/api/v1/coupons/apply', ['items' => [['variant_id' => $this->variant->id, 'quantity' => 1]], 'coupon_code' => $code])->json('data.coupon');
            $this->assertFalse($preview['valid'] ?? true, "{$code} preview");
        }
        $this->assertSame(0, Order::query()->count());
    }

    #[Test]
    public function k6_coupon_valid_in_the_bag_but_expired_at_checkout_is_refused(): void
    {
        Coupon::factory()->create(['code' => 'LASTMIN', 'expires_at' => now()->addMinutes(5)]);
        $preview = $this->postJson('/api/v1/coupons/apply', ['items' => [['variant_id' => $this->variant->id, 'quantity' => 1]], 'coupon_code' => 'LASTMIN'])->json('data.coupon');
        $this->assertTrue($preview['valid']);

        $this->travel(10)->minutes();
        $this->checkout('LASTMIN', 1)->assertJsonValidationErrors('coupon_code');
    }

    #[Test]
    public function k7_total_and_per_phone_limits(): void
    {
        Coupon::factory()->create(['code' => 'TWICE', 'usage_limit' => 2]);
        Coupon::factory()->create(['code' => 'ONEEACH', 'per_phone_limit' => 1]);

        $this->checkout('TWICE', 1)->assertCreated();
        $this->checkout('TWICE', 1)->assertCreated();
        $this->checkout('TWICE', 1)->assertJsonValidationErrors('coupon_code');

        $this->checkout('ONEEACH', 1, '01712345678')->assertCreated();
        $this->checkout('ONEEACH', 1, '+880 1712-345678')->assertJsonValidationErrors('coupon_code');
        $this->checkout('ONEEACH', 1, '01812345678')->assertCreated();
    }

    #[Test]
    public function k8_one_coupon_per_order_and_it_applies_to_the_sale_price(): void
    {
        $this->variant->update(['compare_at_price' => '1500.00']); // on sale: ৳1,000 instead of ৳1,500
        Coupon::factory()->create(['code' => 'TEN', 'type' => 'percent', 'value' => '10']);

        $this->assertSame(['100.00', '970.00'], $this->totals('TEN', 1), '10% of the sale price, not of the old price');
        $this->checkout('TEN,TEN', 1)->assertJsonValidationErrors('coupon_code');
    }

    #[Test]
    public function k9_editing_or_deleting_a_used_coupon_never_changes_past_orders(): void
    {
        $coupon = Coupon::factory()->create(['code' => 'CHANGE', 'type' => 'fixed', 'value' => '100']);
        $uuid = $this->checkout('CHANGE', 1)->assertCreated()->json('data.uuid');
        $unused = Coupon::factory()->create(['code' => 'NEVERUSED']);

        $this->actingAs($this->owner)->patchJson("/api/v1/admin/coupons/{$coupon->id}", ['code' => 'CHANGE', 'type' => 'fixed', 'value' => '500', 'is_active' => true])->assertOk();
        $this->actingAs($this->owner)->deleteJson("/api/v1/admin/coupons/{$coupon->id}")->assertOk()->assertJsonPath('message', 'Coupon has been used, so it was deactivated.');
        $this->actingAs($this->owner)->deleteJson("/api/v1/admin/coupons/{$unused->id}")->assertOk()->assertJsonPath('message', 'Coupon deleted.');

        $order = Order::query()->where('uuid', $uuid)->firstOrFail();
        $this->assertSame(['CHANGE', '100.00', '970.00'], [$order->coupon_code, $order->coupon_discount, $order->grand_total]);
        $this->assertFalse($coupon->refresh()->is_active);
    }

    #[Test]
    public function k10_reports_count_coupon_money_as_discount_not_as_revenue(): void
    {
        Coupon::factory()->create(['code' => 'R25', 'type' => 'percent', 'value' => '25']);
        $order = Order::query()->where('uuid', $this->checkout('R25', 2)->assertCreated()->json('data.uuid'))->firstOrFail();
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => 'confirmed'])->assertOk();
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => 'delivered'])->assertOk();

        $summary = app(ReportService::class)->summary(CarbonImmutable::today(), CarbonImmutable::today())['realized'];
        // 2000 − 25% = 1500 revenue; cost 900; + 70 delivery
        $this->assertSame(['1500.00', '500.00', '900.00', '670.00'], [$summary['product_revenue'], $summary['discounts'], $summary['cogs'], $summary['net_profit']]);
        $this->assertSame('1570.00', $order->refresh()->grand_total);
    }

    #[Test]
    public function k11_new_sale_takes_a_coupon_and_a_manual_discount_without_going_below_zero(): void
    {
        Coupon::factory()->create(['code' => 'POS100', 'type' => 'fixed', 'value' => '100', 'per_phone_limit' => 1]);
        $sale = fn (array $extra) => $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', array_merge([
            'channel' => 'physical_store', 'status' => 'delivered',
            'items' => [['variant_id' => $this->variant->id, 'quantity' => 1]], 'payment' => ['method' => 'cash'],
        ], $extra));

        $sale(['coupon_code' => 'POS100', 'manual_discount' => '50'])->assertCreated()->assertJsonPath('data.grand_total', '850.00');
        // staff may not give it away (below cost); the owner may, and the total stops at ৳0
        $sale(['coupon_code' => 'POS100', 'manual_discount' => '5000'])->assertUnprocessable();
        $this->actingAs($this->owner)->postJson('/api/v1/admin/manual-sales', [
            'channel' => 'physical_store', 'status' => 'delivered', 'coupon_code' => 'POS100', 'manual_discount' => '5000',
            'items' => [['variant_id' => $this->variant->id, 'quantity' => 1]], 'payment' => ['method' => 'cash'],
        ])->assertCreated()->assertJsonPath('data.grand_total', '0.00');
        // OBS: without a phone number the per-phone limit cannot apply — the same walk-in coupon works again
        $this->assertSame(2, Coupon::query()->where('code', 'POS100')->value('used_count'));
    }

    // ───────────── helpers ─────────────

    /** @return array{0: string, 1: string} discount, grand total of a placed order */
    private function totals(string $code, int $quantity): array
    {
        $data = $this->checkout($code, $quantity)->assertCreated()->json('data');

        return [$data['totals']['discount'], $data['totals']['grand_total']];
    }

    private function checkout(string $code, int $quantity, ?string $phone = null): TestResponse
    {
        $this->seq++;

        return $this->postJson('/api/v1/checkout', [
            'customer' => ['name' => "QA {$this->seq}", 'phone' => $phone ?? '0174'.str_pad((string) $this->seq, 7, '0', STR_PAD_LEFT)],
            'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $this->variant->id, 'quantity' => $quantity]],
            'coupon_code' => $code,
            'payment' => ['method' => 'cod'],
        ]);
    }
}
