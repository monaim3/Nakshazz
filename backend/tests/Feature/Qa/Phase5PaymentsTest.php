<?php

namespace Tests\Feature\Qa;

use App\Models\Category;
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
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * QA audit, phase 5: payments and bKash verification.
 * bKash is manual: the customer types the TrxID, staff compare it with the bKash app and
 * press Verify or Reject. No gateway, no callbacks, no real money in these tests.
 * Unit ৳1,000, cost ৳450, delivery ৳70 → order total ৳1,070.
 */
#[Group('qa')]
class Phase5PaymentsTest extends TestCase
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

    #[Test]
    public function y1_verifying_a_valid_trxid_marks_the_order_paid_with_who_and_when(): void
    {
        $order = $this->bkashOrder();
        $payment = $order->payments()->firstOrFail();

        $this->by($this->staff)->getJson('/api/v1/admin/payments/pending')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.transaction_id', $payment->transaction_id);
        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$payment->id}/verify", ['fee' => '19.80'])->assertOk()->assertJsonPath('data.status', 'verified');

        $payment->refresh();
        $this->assertSame([$this->staff->id, '19.80'], [$payment->verified_by, $payment->fee]);
        $this->assertNotNull($payment->verified_at);
        $this->assertSame('paid', $order->refresh()->payment_status->value);
        $this->getJson("/api/v1/orders/{$order->uuid}")->assertJsonPath('data.payment_status', 'paid');
        $this->by($this->staff)->getJson('/api/v1/admin/payments/pending')->assertJsonCount(0, 'data');
        $this->by($this->staff)->getJson('/api/v1/admin/alerts')->assertJsonPath('data.bkash_to_verify', 0);
    }

    #[Test]
    public function y2_a_payment_is_decided_once_verify_twice_or_reject_after_verify_is_refused(): void
    {
        $verified = $this->bkashOrder()->payments()->firstOrFail();
        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$verified->id}/verify")->assertOk();
        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$verified->id}/verify")->assertStatus(409);
        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$verified->id}/reject")->assertStatus(409);

        $rejected = $this->bkashOrder()->payments()->firstOrFail();
        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$rejected->id}/reject", ['note' => 'TrxID not in bKash app'])->assertOk();
        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$rejected->id}/verify")->assertStatus(409);
    }

    #[Test]
    public function y3_rejecting_a_wrong_trxid_leaves_the_order_unpaid_and_staff_can_record_the_real_payment(): void
    {
        $order = $this->bkashOrder();
        $payment = $order->payments()->firstOrFail();

        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$payment->id}/reject", ['note' => 'Customer typed a wrong TrxID'])->assertOk();
        $this->assertSame('unpaid', $order->refresh()->payment_status->value);

        // customer sends the right TrxID by phone; staff record it
        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/payments", ['method' => 'bkash', 'amount' => '1070', 'transaction_id' => 'REAL1234567', 'sender_number' => '01811111111'])->assertCreated();
        $this->assertSame('paid', $order->refresh()->payment_status->value);
    }

    #[Test]
    public function y4_a_valid_payment_rejected_by_mistake_can_be_recorded_again_with_its_own_trxid(): void
    {
        $order = $this->bkashOrder();
        $payment = $order->payments()->firstOrFail();
        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$payment->id}/reject", ['note' => 'Oops, wrong order'])->assertOk();

        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/payments", [
            'method' => 'bkash', 'amount' => '1070', 'transaction_id' => $payment->transaction_id, 'sender_number' => $payment->sender_number,
        ])->assertCreated();

        $this->assertSame('paid', $order->refresh()->payment_status->value);
    }

    #[Test]
    public function y5_customer_sent_less_than_the_total_verify_cannot_correct_the_amount(): void
    {
        $order = $this->bkashOrder();
        $payment = $order->payments()->firstOrFail();

        // customer actually sent ৳1,000 but the record says ৳1,070; verify takes no amount
        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$payment->id}/verify", ['amount' => '1000'])->assertOk();
        $this->assertSame('1070.00', $payment->refresh()->amount);

        // the safe path: reject, then record what really arrived
        $order2 = $this->bkashOrder();
        $p2 = $order2->payments()->firstOrFail();
        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$p2->id}/reject", ['note' => 'Only ৳1,000 received'])->assertOk();
        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$order2->id}/payments", ['method' => 'bkash', 'amount' => '1000', 'transaction_id' => 'PART1234567'])->assertCreated();
        $this->assertSame('partially_paid', $order2->refresh()->payment_status->value);
    }

    #[Test]
    public function y6_recording_money_is_refused_for_cancelled_orders_and_above_what_is_due(): void
    {
        $cancelled = $this->codOrder();
        $this->move($cancelled, 'cancelled');
        $open = $this->codOrder();

        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$cancelled->id}/payments", ['method' => 'cash', 'amount' => '1070'])->assertUnprocessable();
        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$open->id}/payments", ['method' => 'cash', 'amount' => '5000'])->assertUnprocessable();
    }

    #[Test]
    public function y7_cod_prepayment_then_delivery_collects_only_the_rest(): void
    {
        $order = $this->codOrder();
        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/payments", ['method' => 'bkash', 'amount' => '300', 'transaction_id' => 'ADVANCE0001'])->assertCreated();
        $this->assertSame('partially_paid', $order->refresh()->payment_status->value);

        $this->move($order, 'confirmed', 'delivered');

        $amounts = $order->payments()->orderBy('id')->pluck('amount')->all();
        $this->assertSame(['300.00', '770.00'], $amounts);
        $this->assertSame('paid', $order->refresh()->payment_status->value);
    }

    #[Test]
    public function y8_trxid_is_unique_per_method_whatever_the_spaces_or_case(): void
    {
        $a = $this->codOrder();
        $b = $this->codOrder();
        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$a->id}/payments", ['method' => 'bkash', 'amount' => '100', 'transaction_id' => 'ABC 123 XYZ'])->assertCreated();

        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$b->id}/payments", ['method' => 'bkash', 'amount' => '100', 'transaction_id' => 'abc123xyz'])->assertJsonValidationErrors('payment.transaction_id');
        // the same bKash TrxID filed under "mobile banking" slips past the check
        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$b->id}/payments", ['method' => 'mobile_banking', 'amount' => '100', 'transaction_id' => 'ABC123XYZ'])->assertCreated();
    }

    #[Test]
    public function y9_payment_validation(): void
    {
        $order = $this->codOrder();
        $this->by($this->staff);
        $this->postJson("/api/v1/admin/orders/{$order->id}/payments", ['method' => 'cash', 'amount' => '0'])->assertJsonValidationErrors('amount');
        $this->postJson("/api/v1/admin/orders/{$order->id}/payments", ['method' => 'cash', 'amount' => '-10'])->assertJsonValidationErrors('amount');
        $this->postJson("/api/v1/admin/orders/{$order->id}/payments", ['method' => 'cash', 'amount' => '10.555'])->assertJsonValidationErrors('amount');
        $this->postJson("/api/v1/admin/orders/{$order->id}/payments", ['method' => 'paypal', 'amount' => '10'])->assertJsonValidationErrors('method');
        $this->postJson("/api/v1/admin/orders/{$order->id}/payments", ['method' => 'cash', 'amount' => '10', 'fee' => '-1'])->assertJsonValidationErrors('fee');
        $this->postJson('/api/v1/admin/payments/999999/verify')->assertNotFound();
    }

    #[Test]
    public function y10_fees_lower_profit_only_once_the_sale_is_realised(): void
    {
        $order = $this->bkashOrder();
        $payment = $order->payments()->firstOrFail();
        $this->by($this->staff)->postJson("/api/v1/admin/payments/{$payment->id}/verify", ['fee' => '18.50'])->assertOk();

        $this->assertSame('0.00', $this->today()['payment_fees'], 'not delivered yet');
        $this->move($order, 'confirmed', 'delivered');

        $summary = $this->today();
        // 1000 − 450 + 70 − 18.50 = 601.50; a bKash order collects nothing more on delivery
        $this->assertSame(['18.50', '601.50'], [$summary['payment_fees'], $summary['net_profit']]);
        $this->assertSame(1, $order->payments()->count());
    }

    #[Test]
    public function y11_every_order_reconciles_money_in_minus_money_out(): void
    {
        $orders = [];
        $orders[] = $paid = $this->bkashOrder();
        $this->by($this->staff)->postJson('/api/v1/admin/payments/'.$paid->payments()->first()->id.'/verify')->assertOk();
        $orders[] = $cod = $this->codOrder();
        $this->move($cod, 'confirmed', 'delivered');
        $this->by($this->owner)->postJson("/api/v1/admin/orders/{$cod->id}/refunds", ['amount' => '200', 'method' => 'cash'])->assertCreated();
        $orders[] = $part = $this->codOrder();
        $this->by($this->staff)->postJson("/api/v1/admin/orders/{$part->id}/payments", ['method' => 'cash', 'amount' => '500'])->assertCreated();
        $orders[] = $this->bkashOrder();   // still pending

        $expected = [
            [$paid->id, '1070.00', '0.00', 'paid'],
            [$cod->id, '1070.00', '200.00', 'partially_refunded'],
            [$part->id, '500.00', '0.00', 'partially_paid'],
            [$orders[3]->id, '0.00', '0.00', 'pending_verification'],
        ];
        foreach ($expected as [$id, $in, $out, $status]) {
            $sum = fn (string $type) => number_format((float) Payment::query()->where('order_id', $id)->where('type', $type)->where('status', 'verified')->sum('amount'), 2, '.', '');
            $this->assertSame([$in, $out, $status], [$sum('payment'), $sum('refund'), Order::query()->find($id)->payment_status->value], "order {$id}");
        }
    }

    // ───────────── helpers ─────────────

    /** @return array<string, string|int> */
    private function today(): array
    {
        return app(ReportService::class)->summary(CarbonImmutable::today(), CarbonImmutable::today())['realized'];
    }

    private function bkashOrder(): Order
    {
        return $this->order('bkash');
    }

    private function codOrder(): Order
    {
        return $this->order('cod');
    }

    private function order(string $method): Order
    {
        $this->seq++;
        $variant = ProductVariant::factory()->for(Product::factory()->for($this->category))->withStock(5)->create(['price' => '1000.00', 'is_default' => true]);
        $payment = ['method' => $method];
        if ($method === 'bkash') {
            $payment += ['sender_number' => '01811111111', 'transaction_id' => 'BK'.str_pad((string) $this->seq, 9, '0', STR_PAD_LEFT)];
        }

        return app(OrderService::class)->placeWebsiteOrder([
            'customer' => ['name' => "QA {$this->seq}", 'phone' => '0173'.str_pad((string) $this->seq, 7, '0', STR_PAD_LEFT)],
            'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $variant->id, 'quantity' => 1]],
            'payment' => $payment,
        ]);
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
