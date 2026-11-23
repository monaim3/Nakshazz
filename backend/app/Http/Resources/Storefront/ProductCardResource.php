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
            'quick_add' => $this->quickAdd(),
            'image' => $this->primaryImage ? new ImageResource($this->primaryImage) : null,
            'category' => $this->whenLoaded('category', fn () => ['name' => $this->category->name, 'slug' => $this->category->slug]),
            'rating' => $this->when(isset($this->approved_reviews_avg_rating), fn () => round((float) $this->approved_reviews_avg_rating, 1)),
            'reviews_count' => $this->whenCounted('approvedReviews'),
        ];
    }

    /**
     * The variant a card's "+" button adds to the bag in one tap: the default variant when
     * it can be bought, otherwise the cheapest one that can. Null when nothing can be bought.
     *
     * @return array{variant_id: int, max_quantity: int}|null
     */
    private function quickAdd(): ?array
    {
        $buyable = $this->activeVariants
            ->map(fn (ProductVariant $variant) => [
                'variant' => $variant,
                'max' => $variant->allow_backorder ? 10 : min(max(0, $variant->availableStock()), 10),
            ])
            ->filter(fn (array $option) => $option['max'] > 0)
            ->sortBy([
                fn (array $a, array $b) => (int) $b['variant']->is_default <=> (int) $a['variant']->is_default,
                fn (array $a, array $b) => (float) $a['variant']->price <=> (float) $b['variant']->price,
            ]);

        $choice = $buyable->first();

        return $choice ? ['variant_id' => $choice['variant']->id, 'max_quantity' => $choice['max']] : null;
    }
}
