<?php

namespace Database\Factories;

use App\Enums\ProductStatus;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Product>
 */
class ProductFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = Str::title(fake()->words(3, true));

        return [
            'category_id' => Category::factory(),
            'name' => $name,
            'slug' => Str::slug($name).'-'.fake()->unique()->numberBetween(1, 999999),
            'short_description' => fake()->sentence(),
            'description' => fake()->paragraph(),
            'status' => ProductStatus::Active,
            'is_featured' => false,
            'is_made_to_order' => false,
        ];
    }

    public function draft(): static
    {
        return $this->state(fn (array $attributes) => ['status' => ProductStatus::Draft]);
    }

    public function featured(): static
    {
        return $this->state(fn (array $attributes) => ['is_featured' => true]);
    }

    /**
     * Product with a single default variant.
     */
    public function withDefaultVariant(array $variantAttributes = []): static
    {
        return $this->has(
            ProductVariant::factory()->state(array_merge(['is_default' => true, 'title' => 'Default'], $variantAttributes)),
            'variants',
        );
    }
}
