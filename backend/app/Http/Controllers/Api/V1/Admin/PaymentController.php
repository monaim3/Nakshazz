<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentRecordStatus;
use App\Enums\PaymentType;
use App\Enums\RefundReason;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\PaymentResource;
use App\Models\Order;
use App\Models\Payment;
use App\Services\PaymentService;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PaymentController extends Controller
{
    public function __construct(private PaymentService $payments) {}

    /**
     * bKash payments waiting for a staff member to match the TrxID.
     */
    public function pending(): AnonymousResourceCollection
    {
        return PaymentResource::collection(
            Payment::query()->with('order:id,order_number,status')->where('status', PaymentRecordStatus::Pending)->oldest()->oldest('id')->paginate(50)
        );
    }

    /**
     * Money received outside checkout (advance, rest of a part payment, cash at the counter).
     * Never on a cancelled / returned order and never more than is still due.
     */
    public function store(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'method' => ['required', Rule::enum(PaymentMethod::class)],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:9999999', 'decimal:0,2'],
            'fee' => ['nullable', 'numeric', 'min:0', 'max:999999', 'decimal:0,2'],
            'transaction_id' => ['nullable', 'string', 'max:60'],
            'sender_number' => ['nullable', 'string', 'max:20'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $payment = DB::transaction(function () use ($data, $order, $request) {
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);

            if (in_array($order->status, [OrderStatus::Cancelled, OrderStatus::Returned], true)) {
                throw ValidationException::withMessages(['amount' => ["Order {$order->order_number} is {$order->status->value}: no money can be recorded on it."]]);
            }

            $due = $this->payments->amountDue($order);
            if (Money::compare((string) $data['amount'], $due) > 0) {
                throw ValidationException::withMessages(['amount' => [Money::isPositive($due) ? "Only ৳{$due} is still due on this order." : 'Nothing is due on this order.']]);
            }

            return $this->payments->recordPayment($order, [
                ...$data,
                'method' => PaymentMethod::from($data['method']),
                'amount' => (string) $data['amount'],
            ], $request->user());
        });

        return (new PaymentResource($payment))->response()->setStatusCode(201);
    }

    public function verify(Request $request, Payment $payment): PaymentResource
    {
        $data = $request->validate([
            'fee' => ['nullable', 'numeric', 'min:0', 'max:999999', 'decimal:0,2'],
            'amount' => ['nullable', 'numeric', 'min:0.01', 'max:9999999', 'decimal:0,2'],
        ]);

        return new PaymentResource($this->payments->verify(
            $payment,
            $request->user(),
            isset($data['fee']) ? (string) $data['fee'] : null,
            isset($data['amount']) ? (string) $data['amount'] : null,
        ));
    }

    public function reject(Request $request, Payment $payment): PaymentResource
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:255']]);

        return new PaymentResource($this->payments->reject($payment, $request->user(), $data['note'] ?? null));
    }

    /**
     * Money back with no items returned (returns use the order returns endpoint):
     * goodwill (lowers profit) or a cancellation before delivery (never income).
     */
    public function refund(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01', 'decimal:0,2'],
            'method' => ['required', Rule::enum(PaymentMethod::class)],
            'reason' => ['nullable', Rule::in([RefundReason::Compensation->value, RefundReason::Cancellation->value])],
            'transaction_id' => ['nullable', 'string', 'max:60'],
            'note' => ['nullable', 'string', 'max:255'],
            'confirm_duplicate' => ['sometimes', 'boolean'],
        ]);

        // the same refund twice in a day is usually a mistake: ask first
        $sameRefund = $order->payments()
            ->where('type', PaymentType::Refund)
            ->where('status', PaymentRecordStatus::Verified)
            ->where('amount', Money::of((string) $data['amount']))
            ->where('created_at', '>=', now()->subDay())
            ->exists();
        if ($sameRefund && ! $request->boolean('confirm_duplicate')) {
            throw ValidationException::withMessages(['duplicate' => ['A refund of this amount was already recorded for this order today. Record another one?']]);
        }

        $refund = DB::transaction(fn () => $this->payments->refund(
            Order::query()->lockForUpdate()->findOrFail($order->id),
            (string) $data['amount'],
            PaymentMethod::from($data['method']),
            RefundReason::from($data['reason'] ?? RefundReason::Compensation->value),
            $request->user(),
            $data['note'] ?? null,
            transactionId: $data['transaction_id'] ?? null,
        ));

        return (new PaymentResource($refund))->response()->setStatusCode(201);
    }
}
