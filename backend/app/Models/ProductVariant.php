<?php

namespace App\Models;

use Database\Factories\ProductVariantFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Stock fields (stock_on_hand, stock_reserved) are intentionally not fillable:
 * they change only through InventoryService so every change is logged.
 */
#[Fillable([
    'product_id', 'sku', 'title', 'options', 'price', 'compare_at_price',
    'raw_material_cost', 'labour_cost', 'packaging_cost', 'other_cost',
    'low_stock_threshold', 'allow_backorder', 'is_default', 'is_active', 'sort_order',
])]
class ProductVariant extends Model
{
    /** @use HasFactory<ProductVariantFactory> */
    use HasFactory;

    protected static function booted(): void
    {
        static::saving(function (ProductVariant $variant): void {
            $variant->total_cost = bcadd(
                bcadd((string) ($variant->raw_material_cost ?? 0), (string) ($variant->labour_cost ?? 0), 2),
                bcadd((string) ($variant->packaging_cost ?? 0), (string) ($variant->other_cost ?? 0), 2),
                2,
            );
        });
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'options' => 'array',
            'price' => 'decimal:2',
            'compare_at_price' => 'decimal:2',
            'raw_material_cost' => 'decimal:2',
            'labour_cost' => 'decimal:2',
            'packaging_cost' => 'decimal:2',
            'other_cost' => 'decimal:2',
            'total_cost' => 'decimal:2',
            'stock_on_hand' => 'integer',
            'stock_reserved' => 'integer',
            'low_stock_threshold' => 'integer',
            'allow_backorder' => 'boolean',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function movements(): HasMany
    {
        return $this->hasMany(InventoryMovement::class, 'variant_id');
    }

    public function availableStock(): int
    {
        return $this->stock_on_hand - $this->stock_reserved;
    }

    public function canFulfil(int $quantity): bool
    {
        return $this->allow_backorder || $this->availableStock() >= $quantity;
    }

    /**
     * @return array{raw: string, labour: string, packaging: string, other: string}
     */
    public function costBreakdown(): array
    {
        return [
            'raw' => (string) $this->raw_material_cost,
            'labour' => (string) $this->labour_cost,
            'packaging' => (string) $this->packaging_cost,
            'other' => (string) $this->other_cost,
        ];
    }
}
