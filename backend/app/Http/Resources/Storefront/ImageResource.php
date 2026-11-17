<?php

namespace App\Http\Resources\Storefront;

use App\Models\ProductImage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin ProductImage
 */
class ImageResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'variant_id' => $this->variant_id,
            'alt' => $this->alt,
            'width' => $this->width,
            'height' => $this->height,
            'urls' => $this->urls(),
        ];
    }
}
