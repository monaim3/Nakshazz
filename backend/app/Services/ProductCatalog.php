<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Models\Category;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Read-only storefront product queries.
 */
class ProductCatalog
{
    /** @var array<string, string> sort key => description */
    public const SORTS = [
        'newest' => 'Newest first',
        'price' => 'Price: low to high',
        '-price' => 'Price: high to low',
        'popular' => 'Best selling',
        'name' => 'Name A–Z',
    ];

    /**
     * Relations needed by ProductCardResource, loaded in a fixed number of queries.
     *
     * @return array<int|string, mixed>
     */
    public function cardRelations(): array
    {
        return [
            'activeVariants' => fn (HasMany $query) => $query->select([
                'id', 'product_id', 'price', 'compare_at_price', 'stock_on_hand', 'stock_reserved', 'allow_backorder', 'sort_order',
            ]),
            'primaryImage',
            'category:id,name,slug',
        ];
    }

    /**
     * @param  array{q?: string|null, category?: string|null, min_price?: numeric-string|int|null, max_price?: numeric-string|int|null, sort?: string|null, featured?: bool|null, in_stock?: bool|null, per_page?: int|null}  $filters
     */
    public function search(array $filters): LengthAwarePaginator
    {
        $query = $this->baseQuery();

        if (! empty($filters['q'])) {
            $term = '%'.addcslashes(trim($filters['q']), '%_\\').'%';
            $query->where(fn (Builder $q) => $q
                ->where('products.name', 'like', $term)
                ->orWhere('products.short_description', 'like', $term)
                ->orWhereHas('variants', fn (Builder $v) => $v->where('sku', 'like', $term)));
        }

        if (! empty($filters['category'])) {
            $category = Category::query()->active()->where('slug', $filters['category'])->first(['id']);
            $categoryIds = $category === null
                ? [0]
                : Category::query()->active()->where('parent_id', $category->id)->pluck('id')->push($category->id)->all();

            $query->whereIn('products.category_id', $categoryIds);
        }

        if (isset($filters['min_price']) || isset($filters['max_price'])) {
            $query->whereHas('variants', function (Builder $v) use ($filters) {
                $v->where('is_active', true);
                if (isset($filters['min_price'])) {
                    $v->where('price', '>=', $filters['min_price']);
                }
                if (isset($filters['max_price'])) {
                    $v->where('price', '<=', $filters['max_price']);
                }
            });
        }

        if (! empty($filters['featured'])) {
            $query->where('products.is_featured', true);
        }

        if (! empty($filters['in_stock'])) {
            $query->whereHas('variants', fn (Builder $v) => $v->where('is_active', true)
                ->where(fn (Builder $s) => $s->whereColumn('stock_on_hand', '>', 'stock_reserved')->orWhere('allow_backorder', true)));
        }

        $this->applySort($query, $filters['sort'] ?? 'newest');

        return $query->paginate(min((int) ($filters['per_page'] ?? 24), 48))->withQueryString();
    }

    public function findPublishedBySlug(string $slug): ?Product
    {
        return $this->baseQuery()
            ->where('products.slug', $slug)
            ->with(['images', 'activeVariants'])
            ->first();
    }

    /**
     * @return Collection<int, Product>
     */
    public function related(Product $product, int $limit = 8): Collection
    {
        return $this->baseQuery()
            ->where('products.category_id', $product->category_id)
            ->whereKeyNot($product->id)
            ->inRandomOrder()
            ->limit($limit)
            ->get();
    }

    /**
     * @return Collection<int, Product>
     */
    public function featured(int $limit = 8): Collection
    {
        return $this->baseQuery()->where('products.is_featured', true)->latest('products.created_at')->latest('products.id')->limit($limit)->get();
    }

    /**
     * @return Collection<int, Product>
     */
    public function newArrivals(int $limit = 8): Collection
    {
        return $this->baseQuery()->latest('products.created_at')->latest('products.id')->limit($limit)->get();
    }

    /**
     * @return Collection<int, Product>
     */
    public function bestSellers(int $limit = 8): Collection
    {
        $query = $this->baseQuery();
        $this->applySort($query, 'popular');

        return $query->limit($limit)->get();
    }

    /**
     * Published products with everything a product card needs.
     *
     * @return Builder<Product>
     */
    private function baseQuery(): Builder
    {
        return Product::query()
            ->published()
            ->whereHas('variants', fn (Builder $v) => $v->where('is_active', true))
            ->with($this->cardRelations())
            ->withAvg('approvedReviews', 'rating')
            ->withCount('approvedReviews');
    }

    /**
     * @param  Builder<Product>  $query
     */
    private function applySort(Builder $query, string $sort): void
    {
        $minPrice = ProductVariant::query()
            ->selectRaw('MIN(price)')
            ->whereColumn('product_variants.product_id', 'products.id')
            ->where('is_active', true);

        match ($sort) {
            'price' => $query->orderBy($minPrice),
            '-price' => $query->orderByDesc($minPrice),
            'name' => $query->orderBy('products.name'),
            'popular' => $query->orderByDesc(
                OrderItem::query()
                    ->selectRaw('COALESCE(SUM(order_items.quantity - order_items.returned_quantity), 0)')
                    ->join('orders', 'orders.id', '=', 'order_items.order_id')
                    ->whereColumn('order_items.product_id', 'products.id')
                    ->whereNotIn('orders.status', [OrderStatus::Cancelled->value, OrderStatus::Returned->value])
            ),
            default => $query->latest('products.created_at'),
        };

        $query->orderByDesc('products.id');
    }
}
