<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Local-only sample catalog so the storefront has something to render.
 */
class DemoCatalogSeeder extends Seeder
{
    public function run(): void
    {
        if (Product::query()->exists()) {
            return;
        }

        foreach (['Earrings', 'Necklaces', 'Bracelets', 'Rings'] as $index => $name) {
            $category = Category::query()->create([
                'name' => $name,
                'slug' => Str::slug($name),
                'sort_order' => $index,
            ]);

            Product::factory()
                ->count(6)
                ->for($category)
                ->sequence(fn ($sequence) => ['is_featured' => $sequence->index < 2])
                ->has(
                    ProductVariant::factory()
                        ->count(2)
                        ->sequence(
                            ['title' => 'Golden', 'options' => ['Color' => 'Golden'], 'is_default' => true],
                            ['title' => 'Silver', 'options' => ['Color' => 'Silver'], 'price' => '950.00'],
                        )
                        ->withStock(10),
                    'variants',
                )
                ->create();
        }
    }
}
