<?php

namespace App\Models;

use App\Enums\MovementType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Immutable stock ledger row. Created only by InventoryService.
 */
#[Fillable([
    'variant_id', 'type', 'on_hand_delta', 'reserved_delta', 'on_hand_after',
    'reserved_after', 'order_id', 'order_item_id', 'reason', 'user_id',
])]
class InventoryMovement extends Model
{
    public const UPDATED_AT = null;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['type' => MovementType::class];
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
