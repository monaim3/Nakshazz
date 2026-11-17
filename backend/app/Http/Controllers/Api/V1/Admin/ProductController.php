<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\ProductStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveProductRequest;
use App\Http\Resources\Admin\ProductResource;
use App\Models\Product;
use App\Services\ProductService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::enum(ProductStatus::class)],
            'category_id' => ['nullable', 'integer'],
            'featured' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $products = Product::query()
            ->with(['category:id,name', 'primaryImage', 'variants'])
            ->withSum('variants', 'stock_on_hand')
            ->when($filters['q'] ?? null, function (Builder $query, string $term) {
                $like = '%'.addcslashes($term, '%_\\').'%';
                $query->where(fn (Builder $q) => $q->where('name', 'like', $like)->orWhereHas('variants', fn (Builder $v) => $v->where('sku', 'like', $like)));
            })
            ->when($filters['status'] ?? null, fn (Builder $query, string $status) => $query->where('status', $status))
            ->when($filters['category_id'] ?? null, fn (Builder $query, int $id) => $query->where('category_id', $id))
            ->when(isset($filters['featured']), fn (Builder $query) => $query->where('is_featured', (bool) $filters['featured']))
            ->latest()
            ->latest('id')
            ->paginate($filters['per_page'] ?? 25);

        return ProductResource::collection($products);
    }

    public function store(SaveProductRequest $request, ProductService $products): JsonResponse
    {
        $product = $products->save(null, $request->validated(), $request->user());

        return (new ProductResource($product))->response()->setStatusCode(201);
    }

    public function show(Product $product): ProductResource
    {
        return new ProductResource($product->load(['category:id,name', 'variants', 'images']));
    }

    public function update(SaveProductRequest $request, Product $product, ProductService $products): ProductResource
    {
        return new ProductResource($products->save($product, $request->validated(), $request->user()));
    }

    public function destroy(Product $product, ProductService $products): JsonResponse
    {
        $deleted = $products->deleteOrArchive($product);

        return response()->json([
            'message' => $deleted ? 'Product deleted.' : 'Product has sales history, so it was archived instead of deleted.',
            'archived' => ! $deleted,
        ]);
    }
}
