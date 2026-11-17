<?php

namespace App\Models;

use App\Enums\BannerPlacement;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'title', 'subtitle', 'image_path', 'mobile_image_path', 'link_url', 'button_text',
    'placement', 'sort_order', 'is_active', 'starts_at', 'ends_at',
])]
class Banner extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'placement' => BannerPlacement::class,
            'is_active' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    /**
     * Active and inside its optional schedule window.
     */
    #[Scope]
    protected function live(Builder $query): Builder
    {
        return $query->where('is_active', true)
            ->where(fn (Builder $q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn (Builder $q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()))
            ->orderBy('sort_order')
            ->orderBy('id');
    }
}
