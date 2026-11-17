<?php

namespace App\Http\Resources\Admin;

use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Payment
 */
class PaymentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'order_id' => $this->order_id,
            'order_number' => $this->whenLoaded('order', fn () => $this->order->order_number),
            'type' => $this->type,
            'method' => $this->method,
            'method_label' => $this->method->label(),
            'amount' => $this->amount,
            'fee' => $this->when((bool) $request->user()?->can('view-financials'), $this->fee),
            'transaction_id' => $this->transaction_id,
            'sender_number' => $this->sender_number,
            'status' => $this->status,
            'refund_reason' => $this->refund_reason,
            'note' => $this->note,
            'verified_at' => $this->verified_at?->toIso8601String(),
            'paid_at' => $this->paid_at?->toIso8601String(),
        ];
    }
}
