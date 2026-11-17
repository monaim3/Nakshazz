<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\Storefront\ImageResource;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Product
 */
class ProductResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'category_id' => $this->category_id,
            'category' => $this->whenLoaded('category', fn () => ['id' => $this->category->id, 'name' => $this->category->name]),
            'name' => $this->name,
            'slug' => $this->slug,
            'short_description' => $this->short_description,
            'description' => $this->description,
            'status' => $this->status,
            'is_featured' => $this->is_featured,
            'is_made_to_order' => $this->is_made_to_order,
            'preparation_days' => $this->preparation_days,
            'seo_title' => $this->seo_title,
            'seo_description' => $this->seo_description,
            'variants' => VariantResource::collection($this->whenLoaded('variants')),
            'images' => ImageResource::collection($this->whenLoaded('images')),
            'primary_image' => $this->whenLoaded('primaryImage', fn () => $this->primaryImage ? new ImageResource($this->primaryImage) : null),
            'total_stock' => $this->when(isset($this->variants_sum_stock_on_hand), fn () => (int) $this->variants_sum_stock_on_hand),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
