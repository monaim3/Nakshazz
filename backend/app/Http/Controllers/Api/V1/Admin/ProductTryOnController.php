<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\ProductResource;
use App\Models\Product;
use App\Services\ImageProcessor;
use App\Services\ProductService;
use Illuminate\Http\Request;

/**
 * Transparent front-view photo used by the virtual try-on (one earring, the necklace, or the
 * nose pin, background removed). Stored as WebP with its transparency kept.
 */
class ProductTryOnController extends Controller
{
    public function store(Request $request, Product $product, ImageProcessor $images, ProductService $products): ProductResource
    {
        $request->validate([
            'image' => ['required', 'file', 'image', 'mimes:png,webp', 'max:8192', 'dimensions:min_width=150,min_height=150,max_width=6000,max_height=6000'],
        ], [
            'image.mimes' => 'Upload a PNG or WebP with a transparent background.',
        ]);

        $old = $product->tryon_image_path;
        $product->forceFill(['tryon_image_path' => $images->storeSingle($request->file('image'), "tryon/{$product->id}", 1000)])->save();
        $images->delete($old);
        $products->revalidateProduct($product);

        return new ProductResource($product->load(['variants', 'images', 'category']));
    }

    public function destroy(Product $product, ImageProcessor $images, ProductService $products): ProductResource
    {
        $images->delete($product->tryon_image_path);
        $product->forceFill(['tryon_image_path' => null])->save();
        $products->revalidateProduct($product);

        return new ProductResource($product->load(['variants', 'images', 'category']));
    }
}
