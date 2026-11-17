<?php

namespace App\Models;

use App\Enums\PaymentMethod;
use App\Enums\PaymentRecordStatus;
use App\Enums\PaymentType;
use App\Enums\RefundReason;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'order_id', 'type', 'method', 'amount', 'fee', 'transaction_id', 'sender_number',
    'status', 'refund_reason', 'verified_by', 'verified_at', 'paid_at', 'gateway_payload',
    'note', 'created_by',
])]
class Payment extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => PaymentType::class,
            'method' => PaymentMethod::class,
            'status' => PaymentRecordStatus::class,
            'refund_reason' => RefundReason::class,
            'amount' => 'decimal:2',
            'fee' => 'decimal:2',
            'gateway_payload' => 'array',
            'verified_at' => 'datetime',
            'paid_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}
