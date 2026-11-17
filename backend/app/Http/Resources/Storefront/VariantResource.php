<?php

namespace App\Http\Resources\Storefront;

use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public variant data. Cost fields and exact stock counts are never exposed.
 *
 * @mixin ProductVariant
 */
class VariantResource extends JsonResource
{
    private const LOW_STOCK_AT = 3;

    private const MAX_PER_ORDER = 10;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $available = max(0, $this->availableStock());

        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'title' => $this->title,
            'options' => $this->options ?? (object) [],
            'price' => $this->price,
            'compare_at_price' => $this->compare_at_price,
            'stock_status' => $this->stockStatus($available),
            'low_stock_count' => $available > 0 && $available <= self::LOW_STOCK_AT && ! $this->allow_backorder ? $available : null,
            'max_quantity' => $this->allow_backorder ? self::MAX_PER_ORDER : min($available, self::MAX_PER_ORDER),
            'is_default' => $this->is_default,
        ];
    }

    private function stockStatus(int $available): string
    {
        return match (true) {
            $available > 0 => 'in_stock',
            $this->allow_backorder => 'made_to_order',
            default => 'out_of_stock',
        };
    }
}
