<?php

namespace App\Http\Resources\Storefront;

use App\Models\Banner;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/**
 * @mixin Banner
 */
class BannerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $disk = Storage::disk('public');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'subtitle' => $this->subtitle,
            'image_url' => $disk->url($this->image_path),
            'mobile_image_url' => $this->mobile_image_path ? $disk->url($this->mobile_image_path) : null,
            'link_url' => $this->link_url,
            'button_text' => $this->button_text,
            'placement' => $this->placement,
        ];
    }
}
