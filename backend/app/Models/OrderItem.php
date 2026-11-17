<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Snapshot of what was sold. Reports read only these columns, never live product data.
 */
#[Fillable([
    'order_id', 'product_id', 'variant_id', 'product_name', 'variant_title', 'sku',
    'unit_price', 'unit_cost', 'cost_breakdown', 'quantity', 'line_subtotal',
    'discount_allocated', 'line_total',
])]
class OrderItem extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'unit_price' => 'decimal:2',
            'unit_cost' => 'decimal:2',
            'cost_breakdown' => 'array',
            'quantity' => 'integer',
            'line_subtotal' => 'decimal:2',
            'discount_allocated' => 'decimal:2',
            'line_total' => 'decimal:2',
            'returned_quantity' => 'integer',
            'damaged_quantity' => 'integer',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    public function returnableQuantity(): int
    {
        return $this->quantity - $this->returned_quantity;
    }
}
