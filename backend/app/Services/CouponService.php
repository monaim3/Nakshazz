<?php

namespace App\Services;

use App\Enums\CouponType;
use App\Models\Coupon;
use App\Models\CouponUsage;
use App\Models\Order;
use App\Support\Money;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CouponService
{
    /**
     * Find a usable coupon or throw a validation error on the given field.
     *
     * @param  bool  $lock  lock the coupon row (use inside the checkout transaction)
     *
     * @throws ValidationException
     */
    public function resolve(string $code, string $itemsSubtotal, ?string $phone, bool $lock = false, string $field = 'coupon_code'): Coupon
    {
        $query = Coupon::query()->where('code', Str::upper(trim($code)));

        if ($lock) {
            $query->lockForUpdate();
        }

        $coupon = $query->first();
        $fail = fn (string $message) => throw ValidationException::withMessages([$field => [$message]]);

        if ($coupon === null || ! $coupon->is_active) {
            $fail('This coupon code is not valid.');
        }

        if ($coupon->starts_at !== null && $coupon->starts_at->isFuture()) {
            $fail('This coupon is not active yet.');
        }

        if ($coupon->expires_at !== null && $coupon->expires_at->isPast()) {
            $fail('This coupon has expired.');
        }

        if ($coupon->usage_limit !== null && $coupon->used_count >= $coupon->usage_limit) {
            $fail('This coupon has reached its usage limit.');
        }

        if ($coupon->min_order_amount !== null && Money::compare($itemsSubtotal, $coupon->min_order_amount) < 0) {
            $fail('Minimum order for this coupon is ৳'.number_format((float) $coupon->min_order_amount).'.');
        }

        if ($coupon->per_phone_limit !== null && $phone !== null) {
            $usedByPhone = $coupon->usages()->where('customer_phone', $phone)->count();

            if ($usedByPhone >= $coupon->per_phone_limit) {
                $fail('You have already used this coupon.');
            }
        }

        return $coupon;
    }

    public function discountFor(Coupon $coupon, string $itemsSubtotal): string
    {
        $discount = match ($coupon->type) {
            CouponType::Fixed => Money::of($coupon->value),
            CouponType::Percent => Money::percentOf($itemsSubtotal, $coupon->value),
        };

        if ($coupon->max_discount !== null) {
            $discount = Money::min($discount, $coupon->max_discount);
        }

        return Money::min($discount, $itemsSubtotal);
    }

    public function recordUsage(Coupon $coupon, Order $order, string $discount): void
    {
        CouponUsage::query()->create([
            'coupon_id' => $coupon->id,
            'order_id' => $order->id,
            'customer_phone' => $order->customer_phone,
            'discount_amount' => $discount,
        ]);

        $coupon->increment('used_count');
    }

    /**
     * Free the coupon use when an order is cancelled.
     */
    public function releaseUsage(Order $order): void
    {
        $usage = $order->couponUsage()->first();

        if ($usage === null) {
            return;
        }

        Coupon::query()->whereKey($usage->coupon_id)->where('used_count', '>', 0)->decrement('used_count');
        $usage->delete();
    }
}
