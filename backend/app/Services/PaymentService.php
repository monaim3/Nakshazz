<?php

namespace App\Services;

use App\Enums\PaymentMethod;
use App\Enums\PaymentRecordStatus;
use App\Enums\PaymentStatus;
use App\Enums\PaymentType;
use App\Enums\RefundReason;
use App\Exceptions\InvalidOrderStateException;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use App\Support\Money;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PaymentService
{
    /**
     * @param  array{
     *     method: PaymentMethod,
     *     amount: string,
     *     status?: PaymentRecordStatus,
     *     fee?: string|null,
     *     transaction_id?: string|null,
     *     sender_number?: string|null,
     *     note?: string|null,
     * }  $data
     *
     * @throws ValidationException duplicate transaction id
     */
    public function recordPayment(Order $order, array $data, ?User $user = null): Payment
    {
        $status = $data['status'] ?? PaymentRecordStatus::Verified;
        $isVerified = $status === PaymentRecordStatus::Verified;

        $payment = $this->createGuardingDuplicates($order, [
            'type' => PaymentType::Payment,
            'method' => $data['method'],
            'amount' => Money::of($data['amount']),
            'fee' => Money::of($data['fee'] ?? 0),
            'transaction_id' => $this->cleanTransactionId($data['transaction_id'] ?? null),
            'sender_number' => $data['sender_number'] ?? null,
            'status' => $status,
            'verified_by' => $isVerified ? $user?->id : null,
            'verified_at' => $isVerified ? now() : null,
            'paid_at' => now(),
            'note' => $data['note'] ?? null,
            'created_by' => $user?->id,
        ]);

        $this->refreshOrderStatus($order);

        return $payment;
    }

    public function verify(Payment $payment, User $user, ?string $fee = null): Payment
    {
        $this->assertPending($payment);

        $payment->update([
            'status' => PaymentRecordStatus::Verified,
            'fee' => Money::of($fee ?? $payment->fee),
            'verified_by' => $user->id,
            'verified_at' => now(),
        ]);

        $this->refreshOrderStatus($payment->order()->firstOrFail());

        return $payment;
    }

    public function reject(Payment $payment, User $user, ?string $note = null): Payment
    {
        $this->assertPending($payment);

        $payment->update([
            'status' => PaymentRecordStatus::Rejected,
            'verified_by' => $user->id,
            'verified_at' => now(),
            'note' => $note ?? $payment->note,
        ]);

        $this->refreshOrderStatus($payment->order()->firstOrFail());

        return $payment;
    }

    /**
     * @throws ValidationException refund larger than the money actually received
     */
    public function refund(Order $order, string $amount, PaymentMethod $method, RefundReason $reason, User $user, ?string $note = null): Payment
    {
        $amount = Money::of($amount);
        $refundable = $this->netReceived($order);

        if (! Money::isPositive($amount) || Money::compare($amount, $refundable) > 0) {
            throw ValidationException::withMessages([
                'refund.amount' => ["Refund must be between ৳0.01 and ৳{$refundable} (money received)."],
            ]);
        }

        $refund = Payment::query()->create([
            'order_id' => $order->id,
            'type' => PaymentType::Refund,
            'method' => $method,
            'amount' => $amount,
            'status' => PaymentRecordStatus::Verified,
            'refund_reason' => $reason,
            'verified_by' => $user->id,
            'verified_at' => now(),
            'paid_at' => now(),
            'note' => $note,
            'created_by' => $user->id,
        ]);

        $this->refreshOrderStatus($order);

        return $refund;
    }

    /**
     * Amount still owed by the customer: grand total minus verified payments.
     */
    public function amountDue(Order $order): string
    {
        $paid = $this->sumVerified($order, PaymentType::Payment);

        return Money::max(Money::sub($order->grand_total, $paid), '0');
    }

    public function refreshOrderStatus(Order $order): void
    {
        $paid = $this->sumVerified($order, PaymentType::Payment);
        $refunded = $this->sumVerified($order, PaymentType::Refund);
        $hasPending = $order->payments()
            ->where('type', PaymentType::Payment)
            ->where('status', PaymentRecordStatus::Pending)
            ->exists();

        $status = match (true) {
            Money::isPositive($refunded) && Money::compare($refunded, $paid) >= 0 => PaymentStatus::Refunded,
            Money::isPositive($refunded) => PaymentStatus::PartiallyRefunded,
            Money::isPositive($paid) && Money::compare($paid, $order->grand_total) >= 0 => PaymentStatus::Paid,
            Money::isPositive($paid) => PaymentStatus::PartiallyPaid,
            $hasPending => PaymentStatus::PendingVerification,
            default => PaymentStatus::Unpaid,
        };

        $order->update(['payment_status' => $status]);
    }

    private function netReceived(Order $order): string
    {
        return Money::sub(
            $this->sumVerified($order, PaymentType::Payment),
            $this->sumVerified($order, PaymentType::Refund),
        );
    }

    private function sumVerified(Order $order, PaymentType $type): string
    {
        return Money::of($order->payments()
            ->where('type', $type)
            ->where('status', PaymentRecordStatus::Verified)
            ->sum('amount'));
    }

    private function assertPending(Payment $payment): void
    {
        if ($payment->status !== PaymentRecordStatus::Pending) {
            throw new InvalidOrderStateException("This payment is already {$payment->status->value}.");
        }
    }

    /**
     * The (method, transaction_id) unique index blocks a bKash TrxID being reused.
     * A savepoint keeps the outer checkout transaction usable after the violation.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function createGuardingDuplicates(Order $order, array $attributes): Payment
    {
        try {
            return DB::transaction(fn () => Payment::query()->create(['order_id' => $order->id, ...$attributes]));
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'payment.transaction_id' => ['This transaction ID has already been used.'],
            ]);
        }
    }

    private function cleanTransactionId(?string $transactionId): ?string
    {
        $clean = $transactionId === null ? '' : strtoupper(preg_replace('/\s+/', '', $transactionId) ?? '');

        return $clean === '' ? null : $clean;
    }
}
