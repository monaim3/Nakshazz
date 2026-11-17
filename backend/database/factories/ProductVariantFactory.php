<?php

namespace Database\Factories;

use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ProductVariant>
 */
class ProductVariantFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'product_id' => Product::factory(),
            'sku' => 'NK-'.fake()->unique()->bothify('????-####'),
            'title' => 'Default',
            'options' => null,
            'price' => '1000.00',
            'raw_material_cost' => '300.00',
            'labour_cost' => '100.00',
            'packaging_cost' => '30.00',
            'other_cost' => '20.00',
            'is_default' => false,
            'is_active' => true,
            'allow_backorder' => false,
        ];
    }

    /**
     * Stock columns are guarded from mass assignment, so set them after creation.
     */
    public function withStock(int $onHand, int $reserved = 0): static
    {
        return $this->afterCreating(function (ProductVariant $variant) use ($onHand, $reserved): void {
            $variant->forceFill(['stock_on_hand' => $onHand, 'stock_reserved' => $reserved])->save();
        });
    }

    public function backorderable(): static
    {
        return $this->state(fn (array $attributes) => ['allow_backorder' => true]);
    }
}
