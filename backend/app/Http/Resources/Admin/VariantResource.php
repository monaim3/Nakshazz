<?php

namespace App\Http\Resources\Admin;

use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin ProductVariant
 */
class VariantResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $canSeeCosts = (bool) $request->user()?->can('view-financials');

        return [
            'id' => $this->id,
            'product_id' => $this->product_id,
            'sku' => $this->sku,
            'title' => $this->title,
            'options' => $this->options ?? (object) [],
            'price' => $this->price,
            'compare_at_price' => $this->compare_at_price,
            $this->mergeWhen($canSeeCosts, fn () => [
                'raw_material_cost' => $this->raw_material_cost,
                'labour_cost' => $this->labour_cost,
                'packaging_cost' => $this->packaging_cost,
                'other_cost' => $this->other_cost,
                'total_cost' => $this->total_cost,
                'margin' => bcsub((string) $this->price, (string) $this->total_cost, 2),
            ]),
            'stock_on_hand' => $this->stock_on_hand,
            'stock_reserved' => $this->stock_reserved,
            'stock_available' => $this->availableStock(),
            'low_stock_threshold' => $this->low_stock_threshold,
            'allow_backorder' => $this->allow_backorder,
            'is_default' => $this->is_default,
            'is_active' => $this->is_active,
            'sort_order' => $this->sort_order,
            'product' => $this->whenLoaded('product', fn () => [
                'id' => $this->product->id,
                'name' => $this->product->name,
                'slug' => $this->product->slug,
                'status' => $this->product->status,
            ]),
        ];
    }
}
