<?php

namespace App\Http\Controllers\Api\V1\Storefront;

use App\Enums\BannerPlacement;
use App\Enums\ReviewStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Storefront\BannerResource;
use App\Http\Resources\Storefront\CategoryResource;
use App\Http\Resources\Storefront\ProductCardResource;
use App\Http\Resources\Storefront\ReviewResource;
use App\Models\Banner;
use App\Models\Category;
use App\Models\Review;
use App\Services\ProductCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Everything the homepage needs in one request.
 */
class HomeController extends Controller
{
    public function __invoke(Request $request, ProductCatalog $catalog): JsonResponse
    {
        $banners = Banner::query()->live()->get()->groupBy(fn (Banner $banner) => $banner->placement->value);

        return response()->json(['data' => [
            'hero_banners' => BannerResource::collection($banners->get(BannerPlacement::Hero->value, collect())),
            'promo_banners' => BannerResource::collection($banners->get(BannerPlacement::Promo->value, collect())),
            'categories' => CategoryResource::collection(
                Category::query()->active()->whereNull('parent_id')->orderBy('sort_order')->orderBy('name')->get()
            ),
            'featured' => ProductCardResource::collection($catalog->featured()),
            'new_arrivals' => ProductCardResource::collection($catalog->newArrivals()),
            'best_sellers' => ProductCardResource::collection($catalog->bestSellers()),
            'reviews' => ReviewResource::collection(
                Review::query()
                    ->where('status', ReviewStatus::Approved)
                    ->where('is_featured', true)
                    ->latest()
                    ->latest('id')
                    ->limit(9)
                    ->get()
            ),
        ]]);
    }
}
