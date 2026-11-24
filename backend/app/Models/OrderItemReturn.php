<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One return of some units of an order line, dated: reports take the returned value off
 * revenue on this date, not on the day the sale was delivered.
 */
#[Fillable(['order_id', 'order_item_id', 'quantity', 'damaged', 'value', 'user_id', 'returned_at'])]
class OrderItemReturn extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'damaged' => 'integer',
            'value' => 'decimal:2',
            'returned_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class, 'order_item_id');
    }
}
