<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Storefront\CategoryResource;
use App\Models\Category;
use App\Services\ImageProcessor;
use App\Services\StorefrontRevalidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function __construct(
        private ImageProcessor $images,
        private StorefrontRevalidator $revalidator,
    ) {}

    public function index(): AnonymousResourceCollection
    {
        return CategoryResource::collection(
            Category::query()->withCount('products')->orderBy('sort_order')->orderBy('name')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $category = $this->save($request, new Category);

        return (new CategoryResource($category))->response()->setStatusCode(201);
    }

    public function update(Request $request, Category $category): CategoryResource
    {
        return new CategoryResource($this->save($request, $category));
    }

    public function destroy(Category $category): JsonResponse
    {
        abort_if($category->products()->exists(), 409, 'Move or delete this category\'s products first.');

        $category->children()->update(['parent_id' => null]);
        $this->images->delete($category->image_path);
        $category->delete();
        $this->revalidator->revalidate(['categories', 'home']);

        return response()->json(['message' => 'Category deleted.']);
    }

    private function save(Request $request, Category $category): Category
    {
        $data = $request->validate([
            'name' => [$category->exists ? 'sometimes' : 'required', 'string', 'max:100'],
            'slug' => ['nullable', 'string', 'max:120', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', Rule::unique('categories', 'slug')->ignore($category->id)],
            'parent_id' => ['nullable', 'integer', Rule::exists('categories', 'id')->whereNull('parent_id'), Rule::notIn([$category->id])],
            'description' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'seo_title' => ['nullable', 'string', 'max:70'],
            'seo_description' => ['nullable', 'string', 'max:170'],
            'image' => ['nullable', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192', 'dimensions:max_width=8000,max_height=8000'],
        ]);

        $category->fill(Arr::except($data, ['image', 'slug']));
        $category->slug = $data['slug'] ?? $category->slug ?? $this->uniqueSlug($data['name']);

        if ($request->hasFile('image')) {
            $this->images->delete($category->image_path);
            $category->image_path = $this->images->storeSingle($request->file('image'), 'categories', 1200);
        }

        $category->save();
        $this->revalidator->revalidate(['categories', 'home', "category:{$category->slug}"]);

        return $category;
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'category';
        $slug = $base;
        $suffix = 2;

        while (Category::query()->where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
