<?php

namespace Database\Factories;

use App\Enums\CouponType;
use App\Models\Coupon;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Coupon>
 */
class CouponFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => fake()->unique()->bothify('SAVE##??'),
            'type' => CouponType::Fixed,
            'value' => '100.00',
            'is_active' => true,
        ];
    }

    public function percent(string $value, ?string $maxDiscount = null): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => CouponType::Percent,
            'value' => $value,
            'max_discount' => $maxDiscount,
        ]);
    }
}
