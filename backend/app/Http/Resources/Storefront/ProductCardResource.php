<?php

namespace App\Http\Resources\Storefront;

use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Compact product for grids and carousels. Expects `activeVariants`, `primaryImage`
 * and `category` eager loaded (see ProductCatalog::cardRelations()).
 *
 * @mixin Product
 */
class ProductCardResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var ProductVariant|null $cheapest */
        $cheapest = $this->activeVariants->sortBy(fn (ProductVariant $variant) => (float) $variant->price)->first();
        $inStock = $this->activeVariants->contains(fn (ProductVariant $variant) => $variant->availableStock() > 0 || $variant->allow_backorder);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'short_description' => $this->short_description,
            'price' => $cheapest?->price,
            'compare_at_price' => $cheapest?->compare_at_price,
            'has_price_range' => $this->activeVariants->pluck('price')->unique()->count() > 1,
            'in_stock' => $inStock,
            'is_made_to_order' => $this->is_made_to_order,
            'is_featured' => $this->is_featured,
            'image' => $this->primaryImage ? new ImageResource($this->primaryImage) : null,
            'category' => $this->whenLoaded('category', fn () => ['name' => $this->category->name, 'slug' => $this->category->slug]),
            'rating' => $this->when(isset($this->approved_reviews_avg_rating), fn () => round((float) $this->approved_reviews_avg_rating, 1)),
            'reviews_count' => $this->whenCounted('approvedReviews'),
        ];
    }
}
