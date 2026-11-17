<?php

namespace App\Models;

use App\Enums\CouponType;
use Database\Factories\CouponFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

#[Fillable([
    'code', 'type', 'value', 'max_discount', 'min_order_amount', 'starts_at',
    'expires_at', 'usage_limit', 'per_phone_limit', 'is_active',
])]
class Coupon extends Model
{
    /** @use HasFactory<CouponFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => CouponType::class,
            'value' => 'decimal:2',
            'max_discount' => 'decimal:2',
            'min_order_amount' => 'decimal:2',
            'starts_at' => 'datetime',
            'expires_at' => 'datetime',
            'usage_limit' => 'integer',
            'per_phone_limit' => 'integer',
            'used_count' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    protected function code(): Attribute
    {
        return Attribute::make(set: fn (string $value): string => Str::upper(trim($value)));
    }

    public function usages(): HasMany
    {
        return $this->hasMany(CouponUsage::class);
    }
}
