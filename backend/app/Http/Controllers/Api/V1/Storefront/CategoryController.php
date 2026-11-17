<?php

namespace App\Http\Controllers\Api\V1\Storefront;

use App\Http\Controllers\Controller;
use App\Http\Resources\Storefront\CategoryResource;
use App\Models\Category;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CategoryController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $categories = Category::query()
            ->active()
            ->whereNull('parent_id')
            ->with(['children' => fn ($query) => $query->active()->orderBy('sort_order')->orderBy('name')])
            ->withCount(['products' => fn (Builder $query) => $query->published()])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return CategoryResource::collection($categories);
    }

    public function show(string $slug): CategoryResource
    {
        $category = Category::query()
            ->active()
            ->where('slug', $slug)
            ->with(['children' => fn ($query) => $query->active()->orderBy('sort_order')->orderBy('name')])
            ->firstOrFail();

        return new CategoryResource($category);
    }
}
