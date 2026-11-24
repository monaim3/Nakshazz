<?php

namespace Tests\Feature\Qa;

use App\Models\Category;
use App\Models\Coupon;
use App\Models\DeliveryZone;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\OrderService;
use App\Services\ReportService;
use Carbon\CarbonImmutable;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * QA audit, phase 4: refunds, returns and cancellations.
 * Owner rules (2026-11-24): a refunded delivery charge lowers delivery income (Q2); an order
 * holding verified money cannot be cancelled until the refund is recorded, and a pending
 * bKash payment of a cancelled order can only be rejected (Q3); a full return keeps the
 * coupon use (Q4). Tests marked "RULE" encode those rules and fail while the bug is open.
 * Prices: ৳1,000 per unit, cost ৳450 (factory), delivery ৳70.
 */
#[Group('qa')]
class Phase4RefundsReturnsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    private DeliveryZone $zone;

    private Category $category;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(StoreSettingSeeder::class);
        $this->owner = User::factory()->owner()->create();
        $this->staff = User::factory()->create();
        $this->zone = DeliveryZone::factory()->create(['charge' => '70.00']);
        $this->category = Category::factory()->create();
    }

    // ───────────── cancellations (scenarios 1–4) ─────────────

    #[Test]
    public function x1_cancel_before_shipping_releases_stock_and_needs_no_money(): void
    {
        $variant = $this->variant(stock: 5);
        $order = $this->webOrder([[$variant, 2]]);
        $this->move($order, 'confirmed', 'cancelled');

        $this->assertSame([5, 0], [$variant->refresh()->stock_on_hand, $variant->stock_reserved]);
        $this->assertSame('unpaid', $order->payment_status->value);
        $this->assertSame(0, $order->payments()->count());
    }

    #[Test]
    public function x2_shipped_or_delivered_orders_cannot_be_cancelled_only_returned(): void
    {
        $shipped = $this->webOrder([[$this->variant(stock: 5), 1]]);
        $this->move($shipped, 'confirmed', 'shipped');
        $delivered = $this->webOrder([[$this->variant(stock: 5), 1]]);
        $this->move($delivered, 'confirmed', 'delivered');

        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$shipped->id}/status", ['status' => 'cancelled'])->assertStatus(409);
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$delivered->id}/status", ['status' => 'cancelled'])->assertStatus(409);
    }

    #[Test]
    public function x3_rule_q3_an_order_holding_verified_money_cannot_be_cancelled_before_the_refund(): void
    {
        $order = $this->webOrder([[$this->variant(stock: 5), 1]], 'bkash');
        $this->verifyPayment($order);
        $this->move($order, 'confirmed');
        $this->assertSame('paid', $order->payment_status->value);

        $response = $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => 'cancelled']);

        $this->assertContains($response->status(), [409, 422], 'cancelling a paid order must ask for the refund first');
        $this->assertSame('confirmed', $order->refresh()->status->value);
    }

    #[Test]
    public function x4_rule_q3_refund_first_then_cancel_works_and_counts_nowhere_as_income(): void
    {
        $order = $this->webOrder([[$this->variant(stock: 5), 1]], 'bkash');
        $this->verifyPayment($order);
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/refunds", ['amount' => '1070', 'method' => 'bkash', 'note' => 'Customer cancelled'])->assertCreated();
        $this->move($order, 'cancelled');

        $this->assertSame('refunded', $order->payment_status->value);
        $summary = app(ReportService::class)->summary(CarbonImmutable::today(), CarbonImmutable::today())['realized'];
        $this->assertSame(['0.00', '0.00', '0.00'], [$summary['product_revenue'], $summary['compensation'], $summary['net_profit']]);
    }

    #[Test]
    public function x5_rule_q3_pending_bkash_of_a_cancelled_order_cannot_be_approved(): void
    {
        $order = $this->webOrder([[$this->variant(stock: 5), 1]], 'bkash');
        $payment = $order->payments()->firstOrFail();

        // FIXED (rule Q3): an order with a bKash payment still waiting cannot be cancelled
        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => 'cancelled'])->assertStatus(409);
        $this->assertSame('pending', $order->refresh()->status->value);

        // a cancelled order that still has one (older data) can only have it rejected, never approved
        $order->forceFill(['status' => 'cancelled', 'cancelled_at' => now()])->save();
        $response = $this->by($this->staff)->postJson("/api/v1/admin/payments/{$payment->id}/verify");
        $this->assertContains($response->status(), [409, 422], 'approving money for a cancelled order must be refused');
        $this->assertSame('pending', $payment->refresh()->status->value);
        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$payment->id}/reject", ['note' => 'Order cancelled'])->assertOk();

        // the normal path: reject the payment first, then cancel
        $next = $this->webOrder([[$this->variant(stock: 5), 1]], 'bkash');
        $this->by($this->staff)->postJson('/api/v1/admin/payments/'.$next->payments()->firstOrFail()->id.'/reject', ['note' => 'Never arrived'])->assertOk();
        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$next->id}/status", ['status' => 'cancelled'])->assertOk();
    }

    // ───────────── returns & refunds (scenarios 5–13) ─────────────

    #[Test]
    public function x6_full_return_with_full_refund_of_a_cod_order(): void
    {
        $variant = $this->variant(stock: 5);
        $order = $this->delivered([[$variant, 1]]);          // COD ৳1,070 collected
        $item = $order->items()->first();

        $this->returnItems($order, [[$item->id, 1, 0]], ['amount' => '1070', 'method' => 'cash'])->assertOk();

        $order->refresh();
        $this->assertSame(['returned', 'refunded'], [$order->status->value, $order->payment_status->value]);
        $this->assertSame(5, $variant->refresh()->stock_on_hand);
        $this->assertSame('1070.00', $this->refunded($order));
    }

    #[Test]
    public function x7_rule_q2_refunded_delivery_charge_does_not_stay_in_delivery_income(): void
    {
        $order = $this->delivered([[$this->variant(stock: 5), 1]]);
        $this->returnItems($order, [[$order->items()->first()->id, 1, 0]], ['amount' => '1070', 'method' => 'cash'])->assertOk();

        $summary = $this->today();
        $this->assertSame('0.00', $summary['product_revenue']);
        $this->assertSame('0.00', $summary['delivery_income'], 'the ৳70 delivery was given back');
        $this->assertSame('0.00', $summary['net_profit'], 'all money returned, nothing sold');
    }

    #[Test]
    public function x8_refund_without_the_delivery_charge_keeps_the_delivery_income(): void
    {
        $order = $this->delivered([[$this->variant(stock: 5), 1]]);
        $this->returnItems($order, [[$order->items()->first()->id, 1, 0]], ['amount' => '1000', 'method' => 'cash'])->assertOk();

        $summary = $this->today();
        $this->assertSame(['0.00', '70.00', '70.00'], [$summary['product_revenue'], $summary['delivery_income'], $summary['net_profit']]);
        $this->assertSame('partially_refunded', $order->refresh()->payment_status->value);
    }

    #[Test]
    public function x9_one_product_of_a_multi_product_order_and_part_of_a_quantity(): void
    {
        $earring = $this->variant(stock: 10);
        $necklace = $this->variant(stock: 10);
        $order = $this->delivered([[$earring, 3], [$necklace, 1]]);   // 4 × 1000 + 70 = 4070
        $earringItem = $order->items()->where('variant_id', $earring->id)->firstOrFail();

        $this->returnItems($order, [[$earringItem->id, 2, 0]], ['amount' => '2000', 'method' => 'cash'])->assertOk();

        $order->refresh();
        $this->assertSame(['delivered', 'partially_refunded'], [$order->status->value, $order->payment_status->value]);
        $this->assertSame([9, 9], [$earring->refresh()->stock_on_hand, $necklace->refresh()->stock_on_hand]);
        $summary = $this->today();
        // kept: 1 earring + 1 necklace = 2000 revenue, 900 cost, delivery 70
        $this->assertSame(['2000.00', '900.00', '1170.00'], [$summary['product_revenue'], $summary['cogs'], $summary['net_profit']]);

        // the same units cannot come back twice
        $this->returnItems($order, [[$earringItem->id, 2, 0]], null)->assertJsonValidationErrors('items.0.quantity');
        $this->returnItems($order, [[$earringItem->id, 1, 0]], null)->assertOk();
        $this->assertSame('delivered', $order->refresh()->status->value, 'necklace still kept');
    }

    #[Test]
    public function x10_refund_after_a_coupon_matches_what_the_customer_actually_paid_per_item(): void
    {
        $a = $this->variant(stock: 5);
        $b = $this->variant(stock: 5);
        $order = $this->delivered([[$a, 1], [$b, 1]], coupon: '20PC'); // 2000 − 20% = 1600 + 70 = 1670
        $itemA = $order->items()->where('variant_id', $a->id)->firstOrFail();

        $this->assertSame('800.00', $itemA->line_total, 'item paid ৳800 after the coupon');
        $this->returnItems($order, [[$itemA->id, 1, 0]], ['amount' => '800', 'method' => 'cash'])->assertOk();

        $summary = $this->today();
        $this->assertSame('800.00', $summary['product_revenue']);
        $this->assertSame('400.00', $summary['discounts'], 'discount stays as given on the order');
        $this->assertSame(1, Coupon::query()->where('code', '20PC')->value('used_count'), 'Q4: return keeps the coupon use');
    }

    #[Test]
    public function x11_refund_larger_than_the_returned_items_lowers_profit_by_the_extra(): void
    {
        $order = $this->delivered([[$this->variant(stock: 5), 2]]);      // 2000 + 70 = 2070 collected
        $item = $order->items()->first();

        // 1 unit (worth ৳1,000) comes back, shop refunds ৳1,200 (extra ৳200 goodwill)
        $this->returnItems($order, [[$item->id, 1, 0]], ['amount' => '1200', 'method' => 'cash'])->assertOk();

        $summary = $this->today();
        // money kept = 2070 − 1200 = 870; cost of the unit sold = 450 → profit 420
        $this->assertSame('420.00', $summary['net_profit'], 'the extra ৳200 handed back must lower profit');
    }

    #[Test]
    public function x12_goodwill_refund_with_nothing_returned_counts_as_compensation(): void
    {
        $order = $this->delivered([[$this->variant(stock: 5), 1]]);
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/refunds", ['amount' => '150', 'method' => 'bkash', 'note' => 'Scratched clasp'])->assertCreated();

        $summary = $this->today();
        // 1000 − 450 + 70 delivery − 150 compensation = 470
        $this->assertSame(['150.00', '470.00'], [$summary['compensation'], $summary['net_profit']]);
        $this->assertSame(4, ProductVariant::query()->first()->stock_on_hand, 'stock untouched');
    }

    #[Test]
    public function x13_damaged_return_with_refund_restocks_nothing_and_costs_the_unit(): void
    {
        $variant = $this->variant(stock: 5);
        $order = $this->delivered([[$variant, 1]]);
        $this->returnItems($order, [[$order->items()->first()->id, 1, 1]], ['amount' => '1000', 'method' => 'cash'])->assertOk();

        $this->assertSame(4, $variant->refresh()->stock_on_hand);
        $summary = $this->today();
        // revenue 0, cost 450 lost, delivery 70 kept → −380
        $this->assertSame(['0.00', '450.00', '-380.00'], [$summary['product_revenue'], $summary['cogs'], $summary['net_profit']]);
    }

    // ───────────── limits & safety (scenarios 14–17) ─────────────

    #[Test]
    public function x14_refunds_can_never_exceed_the_money_received(): void
    {
        $unpaid = $this->webOrder([[$this->variant(stock: 5), 1]]);
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$unpaid->id}/refunds", ['amount' => '1', 'method' => 'cash'])->assertJsonValidationErrors('refund.amount');

        $order = $this->delivered([[$this->variant(stock: 5), 1]]);   // 1070 received
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/refunds", ['amount' => '1070.01', 'method' => 'cash'])->assertJsonValidationErrors('refund.amount');
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/refunds", ['amount' => '0', 'method' => 'cash'])->assertJsonValidationErrors('amount');
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/refunds", ['amount' => '-5', 'method' => 'cash'])->assertJsonValidationErrors('amount');
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/refunds", ['amount' => '700', 'method' => 'cash'])->assertCreated();
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/refunds", ['amount' => '371', 'method' => 'cash'])->assertJsonValidationErrors('refund.amount');
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/refunds", ['amount' => '370', 'method' => 'cash'])->assertCreated();

        $this->assertSame('1070.00', $this->refunded($order));
        $this->assertSame('refunded', $order->refresh()->payment_status->value);
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/refunds", ['amount' => '1', 'method' => 'cash'])->assertJsonValidationErrors('refund.amount');
    }

    #[Test]
    public function x15_fixed_the_same_refund_twice_is_caught(): void
    {
        $order = $this->delivered([[$this->variant(stock: 5), 1]]);
        $url = "/api/v1/admin/orders/{$order->id}/refunds";
        $this->by($this->owner)->postJson($url, ['amount' => '300', 'method' => 'bkash'], ['Idempotency-Key' => 'r-1'])->assertCreated();

        // FIXED (RISK-1): a retry of the same attempt is answered from the first result
        $this->by($this->owner)->postJson($url, ['amount' => '300', 'method' => 'bkash'], ['Idempotency-Key' => 'r-1'])->assertCreated()->assertHeader('Idempotent-Replayed', 'true');
        $this->assertSame('300.00', $this->refunded($order));
        // FIXED (my call 13): a second identical refund the same day asks first
        $this->by($this->owner)->postJson($url, ['amount' => '300', 'method' => 'bkash'])->assertJsonValidationErrors('duplicate');
        $this->by($this->owner)->postJson($url, ['amount' => '300', 'method' => 'bkash', 'confirm_duplicate' => true])->assertCreated();

        $this->assertSame('600.00', $this->refunded($order));
    }

    #[Test]
    public function x16_only_the_owner_can_give_money_back(): void
    {
        $order = $this->delivered([[$this->variant(stock: 5), 2]]);
        $item = $order->items()->first();

        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/refunds", ['amount' => '100', 'method' => 'cash'])->assertForbidden();
        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/returns", ['items' => [['order_item_id' => $item->id, 'quantity' => 1]], 'refund' => ['amount' => '100', 'method' => 'cash']])->assertForbidden();
        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/returns", ['items' => [['order_item_id' => $item->id, 'quantity' => 1]]])->assertOk();
        $this->assertSame('0.00', $this->refunded($order));
    }

    #[Test]
    public function x17_returns_only_on_shipped_or_delivered_orders_and_only_their_own_items(): void
    {
        $pending = $this->webOrder([[$this->variant(stock: 5), 1]]);
        $this->returnItems($pending, [[$pending->items()->first()->id, 1, 0]], null)->assertStatus(409);

        $order = $this->delivered([[$this->variant(stock: 5), 2]]);
        $other = $this->delivered([[$this->variant(stock: 5), 1]]);
        $this->returnItems($order, [[$other->items()->first()->id, 1, 0]], null)->assertJsonValidationErrors('items.0.order_item_id');
        $this->returnItems($order, [[$order->items()->first()->id, 1, 2]], null)->assertJsonValidationErrors('items.0.quantity');
        $this->returnItems($order, [[$order->items()->first()->id, 3, 0]], null)->assertJsonValidationErrors('items.0.quantity');
    }

    #[Test]
    public function x18_fixed_refund_records_who_when_why_and_the_trxid_of_the_money_sent_back(): void
    {
        $order = $this->delivered([[$this->variant(stock: 5), 1]]);
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/refunds", [
            'amount' => '200', 'method' => 'bkash', 'note' => 'Late delivery', 'transaction_id' => 'RFD12345678',
        ])->assertCreated();

        $refund = Payment::query()->where('order_id', $order->id)->where('type', 'refund')->firstOrFail();
        $this->assertSame([$this->owner->id, 'compensation', 'Late delivery', 'verified'], [$refund->created_by, $refund->refund_reason->value, $refund->note, $refund->status->value]);
        $this->assertNotNull($refund->paid_at);
        // FIXED (my call 5): the TrxID of the money sent back is kept as proof
        $this->assertSame('RFD12345678', $refund->transaction_id);
    }

    #[Test]
    public function x19_fixed_a_return_processed_next_month_is_booked_in_that_month(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-30 15:00:00', 'Asia/Dhaka'));
        $order = $this->delivered([[$this->variant(stock: 5), 1]]);
        $november = fn () => app(ReportService::class)->summary(CarbonImmutable::parse('2026-11-01'), CarbonImmutable::parse('2026-11-30'))['realized'];
        $this->assertSame('1000.00', $november()['product_revenue']);

        $this->travelTo(CarbonImmutable::parse('2026-12-03 11:00:00', 'Asia/Dhaka'));
        $this->returnItems($order, [[$order->items()->first()->id, 1, 0]], ['amount' => '1070', 'method' => 'cash'])->assertOk();

        // FIXED (DECISION-1): November stays as closed; the return and the refunded delivery land in December
        $this->assertSame('1000.00', $november()['product_revenue']);
        $this->assertSame('70.00', $november()['delivery_income']);
        $december = app(ReportService::class)->summary(CarbonImmutable::parse('2026-12-01'), CarbonImmutable::parse('2026-12-31'))['realized'];
        $this->assertSame(0, $december['orders']);
        $this->assertSame(['-1000.00', '1000.00', '-70.00'], [$december['product_revenue'], $december['returns'], $december['delivery_income']]);
    }

    // ───────────── helpers ─────────────

    /** @return array<string, string|int> today's realized report */
    private function today(): array
    {
        return app(ReportService::class)->summary(CarbonImmutable::today(), CarbonImmutable::today())['realized'];
    }

    private function refunded(Order $order): string
    {
        return number_format((float) Payment::query()->where('order_id', $order->id)->where('type', 'refund')->where('status', 'verified')->sum('amount'), 2, '.', '');
    }

    /** @param list<array{0: int, 1: int, 2: int}> $lines  item id, quantity, damaged */
    private function returnItems(Order $order, array $lines, ?array $refund): TestResponse
    {
        return $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/returns", array_filter([
            'items' => array_map(fn ($l) => ['order_item_id' => $l[0], 'quantity' => $l[1], 'damaged' => $l[2]], $lines),
            'refund' => $refund,
        ]));
    }

    private function verifyPayment(Order $order): void
    {
        $payment = $order->payments()->where('status', 'pending')->firstOrFail();
        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$payment->id}/verify")->assertOk();
        $order->refresh();
    }

    /** @param list<array{0: ProductVariant, 1: int}> $lines */
    private function delivered(array $lines, ?string $coupon = null): Order
    {
        $order = $this->webOrder($lines, 'cod', $coupon);
        $this->move($order, 'confirmed', 'delivered');

        return $order;
    }

    /** @param list<array{0: ProductVariant, 1: int}> $lines */
    private function webOrder(array $lines, string $method = 'cod', ?string $coupon = null): Order
    {
        $this->seq++;
        if ($coupon !== null && ! Coupon::query()->where('code', $coupon)->exists()) {
            Coupon::factory()->create(['code' => $coupon, 'type' => 'percent', 'value' => '20', 'is_active' => true]);
        }
        $payment = ['method' => $method];
        if ($method === 'bkash') {
            $payment += ['sender_number' => '01811111111', 'transaction_id' => 'QAX'.str_pad((string) $this->seq, 8, '0', STR_PAD_LEFT)];
        }

        return app(OrderService::class)->placeWebsiteOrder([
            'customer' => ['name' => "QA {$this->seq}", 'phone' => '0172'.str_pad((string) $this->seq, 7, '0', STR_PAD_LEFT)],
            'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => array_map(fn ($l) => ['variant_id' => $l[0]->id, 'quantity' => $l[1]], $lines),
            'coupon_code' => $coupon,
            'payment' => $payment,
        ]);
    }

    private function variant(int $stock): ProductVariant
    {
        return ProductVariant::factory()->for(Product::factory()->for($this->category))->withStock($stock)->create(['price' => '1000.00', 'is_default' => true]);
    }

    private function by(User $user): static
    {
        return $this->actingAs($user);
    }

    private function move(Order $order, string ...$statuses): void
    {
        foreach ($statuses as $status) {
            $this->by($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => $status])->assertOk();
        }
        $order->refresh();
    }
}
