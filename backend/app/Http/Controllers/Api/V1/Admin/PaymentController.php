<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\PaymentMethod;
use App\Enums\PaymentRecordStatus;
use App\Enums\RefundReason;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\PaymentResource;
use App\Models\Order;
use App\Models\Payment;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PaymentController extends Controller
{
    public function __construct(private PaymentService $payments) {}

    /**
     * bKash payments waiting for a staff member to match the TrxID.
     */
    public function pending(): AnonymousResourceCollection
    {
        return PaymentResource::collection(
            Payment::query()->with('order:id,order_number')->where('status', PaymentRecordStatus::Pending)->oldest()->oldest('id')->paginate(50)
        );
    }

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

        $payment = DB::transaction(fn () => $this->payments->recordPayment($order, [
            ...$data,
            'method' => PaymentMethod::from($data['method']),
            'amount' => (string) $data['amount'],
        ], $request->user()));

        return (new PaymentResource($payment))->response()->setStatusCode(201);
    }

    public function verify(Request $request, Payment $payment): PaymentResource
    {
        $data = $request->validate(['fee' => ['nullable', 'numeric', 'min:0', 'max:999999', 'decimal:0,2']]);

        return new PaymentResource($this->payments->verify($payment, $request->user(), isset($data['fee']) ? (string) $data['fee'] : null));
    }

    public function reject(Request $request, Payment $payment): PaymentResource
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:255']]);

        return new PaymentResource($this->payments->reject($payment, $request->user(), $data['note'] ?? null));
    }

    /**
     * Goodwill refund with no items returned (returns use the order returns endpoint).
     */
    public function refund(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01', 'decimal:0,2'],
            'method' => ['required', Rule::enum(PaymentMethod::class)],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $refund = DB::transaction(fn () => $this->payments->refund(
            $order,
            (string) $data['amount'],
            PaymentMethod::from($data['method']),
            RefundReason::Compensation,
            $request->user(),
            $data['note'] ?? null,
        ));

        return (new PaymentResource($refund))->response()->setStatusCode(201);
    }
}
