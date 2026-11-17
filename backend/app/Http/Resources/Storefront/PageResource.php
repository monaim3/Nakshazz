<?php

namespace App\Http\Resources\Storefront;

use App\Models\Page;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Body is markdown; the storefront renders it with raw HTML disabled.
 *
 * @mixin Page
 */
class PageResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'slug' => $this->slug,
            'title' => $this->title,
            'body' => $this->body,
            'seo' => [
                'title' => $this->seo_title ?: $this->title,
                'description' => $this->seo_description,
            ],
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
