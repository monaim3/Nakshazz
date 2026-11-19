<?php

namespace App\Http\Resources\Storefront;

use App\Models\Product;
use Illuminate\Http\Request;

/**
 * @mixin Product
 */
class ProductDetailResource extends ProductCardResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            ...parent::toArray($request),
            'description' => $this->description,
            'preparation_days' => $this->preparation_days,
            'images' => ImageResource::collection($this->images),
            'variants' => VariantResource::collection($this->activeVariants),
            'option_names' => $this->optionNames(),
            'tryon' => $this->tryon_type && $this->tryon_image_path ? [
                'type' => $this->tryon_type,
                'size_mm' => $this->tryon_size_mm ?? $this->tryon_type->defaultSizeMm(),
                'image_path' => $this->tryon_image_path,
            ] : null,
            'seo' => [
                'title' => $this->seo_title ?: $this->name,
                'description' => $this->seo_description ?: $this->short_description,
            ],
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Ordered option names across variants, e.g. ["Color", "Size"], for building selectors.
     *
     * @return list<string>
     */
    private function optionNames(): array
    {
        return $this->activeVariants
            ->flatMap(fn ($variant) => array_keys($variant->options ?? []))
            ->unique()
            ->values()
            ->all();
    }
}
