<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Storefront\ImageResource;
use App\Models\Product;
use App\Models\ProductImage;
use App\Services\ImageProcessor;
use App\Services\ProductService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ProductImageController extends Controller
{
    public function store(Request $request, Product $product, ImageProcessor $images, ProductService $products): AnonymousResourceCollection
    {
        $request->validate([
            'images' => ['required', 'array', 'min:1', 'max:10'],
            'images.*' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192', 'dimensions:min_width=400,min_height=400,max_width=8000,max_height=8000'],
            'variant_id' => ['nullable', 'integer', Rule::exists('product_variants', 'id')->where('product_id', $product->id)],
        ]);

        $hasPrimary = $product->images()->where('is_primary', true)->exists();
        $nextSort = (int) $product->images()->max('sort_order') + 1;
        $created = [];

        foreach ($request->file('images') as $index => $file) {
            $stored = $images->storeResponsive($file, "products/{$product->id}");

            $created[] = $product->images()->create([
                'variant_id' => $request->integer('variant_id') ?: null,
                'path' => $stored['path'],
                'alt' => $product->name,
                'width' => $stored['width'],
                'height' => $stored['height'],
                'sort_order' => $nextSort + $index,
                'is_primary' => ! $hasPrimary && $index === 0,
            ]);
        }

        $products->revalidateProduct($product);

        return ImageResource::collection(collect($created));
    }

    public function update(Request $request, ProductImage $image, ProductService $products): ImageResource
    {
        $data = $request->validate([
            'alt' => ['nullable', 'string', 'max:150'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'is_primary' => ['nullable', 'boolean'],
            'variant_id' => ['nullable', 'integer', Rule::exists('product_variants', 'id')->where('product_id', $image->product_id)],
        ]);

        DB::transaction(function () use ($image, $data): void {
            if (! empty($data['is_primary'])) {
                ProductImage::query()->where('product_id', $image->product_id)->update(['is_primary' => false]);
            }

            $image->update($data);
        });

        $products->revalidateProduct($image->product()->firstOrFail());

        return new ImageResource($image);
    }

    public function destroy(ProductImage $image, ImageProcessor $images, ProductService $products): JsonResponse
    {
        $product = $image->product()->firstOrFail();
        $wasPrimary = $image->is_primary;

        $image->delete();
        $images->deleteResponsive($image->path);

        if ($wasPrimary) {
            $product->images()->orderBy('sort_order')->orderBy('id')->first()?->update(['is_primary' => true]);
        }

        $products->revalidateProduct($product);

        return response()->json(['message' => 'Image deleted.']);
    }
}
