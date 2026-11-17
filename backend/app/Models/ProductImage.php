<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

#[Fillable(['product_id', 'variant_id', 'path', 'alt', 'width', 'height', 'sort_order', 'is_primary'])]
class ProductImage extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['is_primary' => 'boolean'];
    }

    /**
     * Upload pipeline stores `<name>.webp` (1600px) plus `_md` (800px) and `_sm` (400px) copies.
     *
     * @return array{sm: string, md: string, lg: string}
     */
    public function urls(): array
    {
        $disk = Storage::disk('public');
        $base = preg_replace('/\.webp$/', '', $this->path);

        return [
            'sm' => $disk->url("{$base}_sm.webp"),
            'md' => $disk->url("{$base}_md.webp"),
            'lg' => $disk->url($this->path),
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }
}
