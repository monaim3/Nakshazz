<?php

namespace Tests\Feature\Qa;

use App\Enums\MovementType;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\ProductVariant;
use App\Services\InventoryService;
use App\Services\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * QA audit, phase 11: inventory and money reconciliation after the November month,
 * plus stock received, a breakage write-off and a recount on 1 December.
 */
#[Group('qa')]
class Phase11ReconciliationTest extends TestCase
{
    use BuildsNovember;
    use RefreshDatabase;

    private const OPENING = 100;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpNovember();
        $this->runNovember();

        DB::transaction(function (): void {
            $inventory = app(InventoryService::class);
            $lock = fn (string $k) => $inventory->lockVariants([$this->v[$k]->id])->first();
            $inventory->adjust($lock('A'), MovementType::Purchase, 20, 'New batch from the karigar', $this->owner);
            $inventory->adjust($lock('B'), MovementType::AdjustmentOut, 3, 'Broken in the shop', $this->owner);
            $inventory->adjust($lock('C'), MovementType::AdjustmentIn, 1, 'Recount found one extra', $this->owner);
        });
    }

    #[Test]
    public function r1_every_variant_closes_at_the_hand_calculated_stock(): void
    {
        // opening + received + returned to shelf − left the shop − written off ± recount = closing
        $expected = [
            'A' => ['on_hand' => self::OPENING + 20 + 1 - 8, 'reserved' => 1], // out: O1 2, O4 1, O6 3, O11 1, O13 1; back: 1 good from O6; O9 holds 1
            'B' => ['on_hand' => self::OPENING - 6 - 3, 'reserved' => 1],      // out: O2 1, O4 2, O7 2, O12 1; broken 3; O10 holds 1
            'C' => ['on_hand' => self::OPENING - 2 + 1, 'reserved' => 0],      // out: O3 1, O8 1; O5 cancelled; recount +1
        ];

        foreach ($expected as $key => $want) {
            $variant = $this->v[$key]->refresh();
            $this->assertSame([$want['on_hand'], $want['reserved']], [$variant->stock_on_hand, $variant->stock_reserved], "variant {$key}");
            $this->assertGreaterThanOrEqual(0, $variant->stock_on_hand);
        }
    }

    #[Test]
    public function r2_the_movement_log_adds_up_and_has_no_gaps(): void
    {
        foreach ($this->v as $key => $variant) {
            $variant->refresh();
            $rows = InventoryMovement::query()->where('variant_id', $variant->id)->orderBy('id')->get();

            $this->assertSame($variant->stock_on_hand, self::OPENING + (int) $rows->sum('on_hand_delta'), "{$key} on hand = opening + log");
            $this->assertSame($variant->stock_reserved, (int) $rows->sum('reserved_delta'), "{$key} reserved = log (nothing clamped away)");

            // each row's "after" value follows from the previous one: no lost or overlapping updates
            [$onHand, $reserved] = [self::OPENING, 0];
            foreach ($rows as $row) {
                $onHand += $row->on_hand_delta;
                $reserved += $row->reserved_delta;
                $this->assertSame([$onHand, $reserved], [$row->on_hand_after, $row->reserved_after], "{$key} row {$row->id} ({$row->type->value})");
                $this->assertTrue($row->order_id !== null || filled($row->reason), "{$key} row {$row->id} has an order or a reason");
            }
        }
    }

    #[Test]
    public function r3_stock_recounted_from_the_orders_alone_matches(): void
    {
        $manual = InventoryMovement::query()
            ->whereIn('type', [MovementType::Purchase, MovementType::AdjustmentIn, MovementType::AdjustmentOut])
            ->selectRaw('variant_id, SUM(on_hand_delta) as delta')->groupBy('variant_id')->pluck('delta', 'variant_id');

        foreach ($this->v as $key => $variant) {
            $items = OrderItem::query()->where('variant_id', $variant->id)->with('order')->get();
            $leftShop = $items->filter(fn ($i) => in_array($i->order->status->value, ['shipped', 'delivered', 'returned'], true))->sum('quantity');
            $backOnShelf = $items->sum(fn ($i) => $i->returned_quantity - $i->damaged_quantity);
            $held = $items->filter(fn ($i) => in_array($i->order->status->value, ['pending', 'confirmed', 'processing'], true))->sum('quantity');

            $variant->refresh();
            $this->assertSame($variant->stock_on_hand, self::OPENING + (int) ($manual[$variant->id] ?? 0) - $leftShop + $backOnShelf, "{$key} on hand from orders");
            $this->assertSame($variant->stock_reserved, $held, "{$key} reserved from open orders");
        }
    }

    #[Test]
    public function r4_no_double_or_missing_stock_movements_per_order_line(): void
    {
        foreach (OrderItem::query()->with('order')->get() as $item) {
            $count = fn (MovementType $type) => InventoryMovement::query()->where('order_item_id', $item->id)->where('type', $type)->count();
            $status = $item->order->status->value;
            $label = "{$item->order->order_number} {$status}";
            $isWeb = $item->order->source->value === 'website';
            $direct = ! $isWeb && $item->order->getRawOriginal('confirmed_at') === $item->order->getRawOriginal('delivered_at') && $item->order->delivered_at !== null;

            $this->assertSame(in_array($status, ['shipped', 'delivered', 'returned'], true) ? 1 : 0, $count(MovementType::Sale), "{$label}: one sale row when it left the shop");
            $this->assertSame($status === 'cancelled' ? 1 : 0, $count(MovementType::Release), "{$label}: release only when cancelled");
            $this->assertSame($direct ? 0 : 1, $count(MovementType::Reserve), "{$label}: reserved once unless sold over the counter");
        }
    }

    #[Test]
    public function r5_money_billed_minus_received_minus_credits_equals_still_owed(): void
    {
        $orders = Order::query()->where('status', '!=', 'cancelled')->get();
        $sum = fn (string $type) => (float) Payment::query()->where('type', $type)->where('status', 'verified')->sum('amount');

        $billed = (float) $orders->sum('grand_total');               // 12 non-cancelled orders
        $received = $sum('payment');                                  // incl. O13 cash on 1 Dec
        $refunded = $sum('refund');
        $credits = 2000.0 + 200.0;                                    // O6 return refund + O8 goodwill (no money owed back for those)
        $owed = $orders->sum(fn (Order $o) => (float) app(PaymentService::class)->amountDue($o));

        $this->assertSame(16830.0, $billed);
        $this->assertSame(14020.0, $received);
        $this->assertSame(2200.0, $refunded);
        $this->assertSame(2810.0, $owed, 'O9 1070 + O10 670 + O11 1070');
        $this->assertSame($owed, $billed - ($received - $refunded) - $credits);
    }

    #[Test]
    public function r6_payments_are_unique_and_every_status_matches_its_money(): void
    {
        $this->assertSame(0, Payment::query()->whereNotNull('transaction_id')->select('method', 'transaction_id')->groupBy('method', 'transaction_id')->havingRaw('COUNT(*) > 1')->count());
        $this->assertSame(0, Payment::query()->where('method', 'cod')->select('order_id')->groupBy('order_id')->havingRaw('COUNT(*) > 1')->count(), 'cash collected once per delivery');

        foreach (Order::query()->with('payments')->get() as $order) {
            $in = (float) $order->payments->where('type', 'payment')->where('status', 'verified')->sum('amount');
            $out = (float) $order->payments->where('type', 'refund')->where('status', 'verified')->sum('amount');
            $expected = match (true) {
                $out > 0 && $out >= $in => 'refunded',
                $out > 0 => 'partially_refunded',
                $in > 0 && $in >= (float) $order->grand_total => 'paid',
                $in > 0 => 'partially_paid',
                $order->payments->where('status', 'pending')->isNotEmpty() => 'pending_verification',
                default => 'unpaid',
            };
            $this->assertSame($expected, $order->payment_status->value, $order->order_number);
            $this->assertLessThanOrEqual($in, $out, "{$order->order_number} never refunds more than received");
        }
    }

    #[Test]
    public function r7_stock_value_at_cost_is_computable_but_not_reported(): void
    {
        $value = ProductVariant::query()->get()->sum(fn ($v) => $v->stock_on_hand * (float) bcadd(bcadd($v->raw_material_cost, $v->labour_cost, 2), bcadd($v->packaging_cost, $v->other_cost, 2), 2));

        // A 113 × 450 + B 91 × 250 + C 99 × 700
        $this->assertSame(50850.0 + 22750.0 + 69300.0, $value);
        $this->actingAs($this->owner)->getJson('/api/v1/admin/inventory')->assertOk()->assertJsonMissingPath('meta.stock_value')->assertJsonMissingPath('summary');
    }
}
