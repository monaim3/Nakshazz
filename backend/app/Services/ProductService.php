<?php

namespace App\Services;

use App\Enums\MovementType;
use App\Enums\ProductStatus;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProductService
{
    private const COST_FIELDS = ['raw_material_cost', 'labour_cost', 'packaging_cost', 'other_cost'];

    private const VARIANT_FIELDS = [
        'sku', 'title', 'options', 'price', 'compare_at_price', 'raw_material_cost', 'labour_cost',
        'packaging_cost', 'other_cost', 'low_stock_threshold', 'allow_backorder', 'is_active', 'sort_order',
    ];

    public function __construct(
        private InventoryService $inventory,
        private StorefrontRevalidator $revalidator,
        private ImageProcessor $images,
    ) {}

    /**
     * Create or update a product and its variants in one transaction.
     * Staff cannot change cost fields; those keys are dropped for non-owners.
     *
     * @param  array<string, mixed>  $data
     */
    public function save(?Product $product, array $data, User $user): Product
    {
        $canEditCosts = $user->can('view-financials');

        $product ??= new Product;
        $oldSlug = $product->slug;

        DB::transaction(function () use ($product, $data, $user, $canEditCosts): void {
            $slugSource = ! empty($data['slug']) ? $data['slug'] : ($data['name'] ?? $product->name);

            $product->fill(Arr::except($data, ['variants', 'slug']));
            $product->slug = $this->uniqueSlug($slugSource, $product->id);
            $product->save();

            if (array_key_exists('variants', $data)) {
                $this->syncVariants($product, $data['variants'], $user, $canEditCosts);
            }
        });

        $this->revalidateProduct($product, $oldSlug !== null && $oldSlug !== $product->slug ? $oldSlug : null);

        return $product->load(['variants', 'images', 'category']);
    }

    /**
     * Products with sales history are archived, never deleted.
     *
     * @return bool true when deleted, false when archived
     */
    public function deleteOrArchive(Product $product): bool
    {
        $hasHistory = $product->orderItems()->exists()
            || $product->variants()->whereHas('movements')->exists();

        if ($hasHistory) {
            $product->update(['status' => ProductStatus::Archived, 'is_featured' => false]);
            $this->revalidateProduct($product);

            return false;
        }

        $paths = $product->images()->pluck('path');
        $product->delete();
        $paths->each(fn (string $path) => $this->images->deleteResponsive($path));
        $this->revalidateProduct($product);

        return true;
    }

    public function revalidateProduct(Product $product, ?string $previousSlug = null): void
    {
        $this->revalidator->revalidate(array_filter([
            'products', 'home', "product:{$product->slug}", $previousSlug ? "product:{$previousSlug}" : null,
        ]));
    }

    /**
     * @param  list<array<string, mixed>>  $variants
     */
    private function syncVariants(Product $product, array $variants, User $user, bool $canEditCosts): void
    {
        $keptIds = [];

        foreach (array_values($variants) as $index => $input) {
            $variant = isset($input['id'])
                ? $product->variants()->whereKey($input['id'])->firstOrFail()
                : new ProductVariant(['product_id' => $product->id]);

            $attributes = Arr::only($input, self::VARIANT_FIELDS);
            if (! $canEditCosts) {
                $attributes = Arr::except($attributes, self::COST_FIELDS);
            }

            $variant->fill($attributes);
            $variant->product_id = $product->id;
            $variant->title = $variant->title ?: 'Default';
            $variant->sort_order = $input['sort_order'] ?? $index;
            $variant->is_default = $index === 0;
            $variant->allow_backorder = (bool) ($input['allow_backorder'] ?? $product->is_made_to_order);
            $isNew = ! $variant->exists;
            $variant->save();

            if ($isNew && ($input['initial_stock'] ?? 0) > 0) {
                $locked = $this->inventory->lockVariants([$variant->id])->first();
                $this->inventory->adjust($locked, MovementType::Purchase, (int) $input['initial_stock'], 'Opening stock', $user);
            }

            $keptIds[] = $variant->id;
        }

        $product->variants()->whereNotIn('id', $keptIds)->get()->each(function (ProductVariant $variant): void {
            $hasHistory = $variant->movements()->exists() || DB::table('order_items')->where('variant_id', $variant->id)->exists();

            $hasHistory ? $variant->update(['is_active' => false, 'is_default' => false]) : $variant->delete();
        });
    }

    private function uniqueSlug(string $source, ?int $ignoreId): string
    {
        $base = Str::slug($source) ?: 'product';
        $slug = $base;
        $suffix = 2;

        while (Product::query()->where('slug', $slug)->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
