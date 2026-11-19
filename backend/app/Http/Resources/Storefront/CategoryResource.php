<?php

namespace App\Http\Resources\Storefront;

use App\Models\Category;
use App\Services\ImageProcessor;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/**
 * @mixin Category
 */
class CategoryResource extends JsonResource
{
    private function thumbnailUrl(): ?string
    {
        if (! $this->image_path) {
            return null;
        }

        $disk = Storage::disk('public');
        $thumbnail = app(ImageProcessor::class)->thumbnailPath($this->image_path);

        // older categories may not have a small copy yet: fall back to the full picture
        return $disk->url($disk->exists($thumbnail) ? $thumbnail : $this->image_path);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'image_url' => $this->image_path ? Storage::disk('public')->url($this->image_path) : null,
            'image_thumb_url' => $this->thumbnailUrl(),
            'parent_id' => $this->parent_id,
            'is_active' => $this->is_active,
            'sort_order' => $this->sort_order,
            'seo' => [
                'title' => $this->seo_title,
                'description' => $this->seo_description,
            ],
            'children' => CategoryResource::collection($this->whenLoaded('children')),
            'products_count' => $this->whenCounted('products'),
        ];
    }
}
