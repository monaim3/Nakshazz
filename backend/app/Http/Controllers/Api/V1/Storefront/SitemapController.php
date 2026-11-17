<?php

namespace App\Http\Controllers\Api\V1\Storefront;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Page;
use App\Models\Product;
use Illuminate\Http\JsonResponse;

/**
 * Lightweight slug + lastmod list for the Next.js sitemap.xml.
 */
class SitemapController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json(['data' => [
            'products' => Product::query()->published()->orderBy('id')->get(['slug', 'updated_at']),
            'categories' => Category::query()->active()->orderBy('id')->get(['slug', 'updated_at']),
            'pages' => Page::query()->orderBy('id')->get(['slug', 'updated_at']),
        ]]);
    }
}
