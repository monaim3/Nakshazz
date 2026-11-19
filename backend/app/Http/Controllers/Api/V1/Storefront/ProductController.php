<?php

namespace App\Http\Controllers\Api\V1\Storefront;

use App\Enums\ReviewStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\ProductIndexRequest;
use App\Http\Resources\Storefront\ProductCardResource;
use App\Http\Resources\Storefront\ProductDetailResource;
use App\Http\Resources\Storefront\ReviewResource;
use App\Models\Product;
use App\Services\ProductCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ProductController extends Controller
{
    public function index(ProductIndexRequest $request, ProductCatalog $catalog): AnonymousResourceCollection
    {
        return ProductCardResource::collection($catalog->search($request->validated()));
    }

    public function show(string $slug, ProductCatalog $catalog): JsonResponse
    {
        $product = $catalog->findPublishedBySlug($slug);

        abort_if($product === null, 404, 'Product not found.');

        $reviews = $product->approvedReviews()->latest()->latest('id')->limit(6)->get();

        return response()->json(['data' => [
            ...(new ProductDetailResource($product))->resolve(),
            'category' => ['name' => $product->category->name, 'slug' => $product->category->slug],
            'reviews' => ReviewResource::collection($reviews),
            'related' => ProductCardResource::collection($catalog->related($product)),
        ]]);
    }

    /**
     * Sidebar facets: price bounds, colours and on-sale count (optionally per category).
     */
    public function facets(Request $request, ProductCatalog $catalog): JsonResponse
    {
        $category = $request->string('category')->limit(120, '')->toString();

        return response()->json(['data' => $catalog->facets($category !== '' ? $category : null)]);
    }

    public function reviews(string $slug): AnonymousResourceCollection
    {
        $product = Product::query()->published()->where('slug', $slug)->firstOrFail(['id']);

        return ReviewResource::collection(
            $product->reviews()->where('status', ReviewStatus::Approved)->latest()->latest('id')->paginate(10)
        );
    }
}
