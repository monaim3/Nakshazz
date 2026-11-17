<?php

namespace App\Http\Controllers\Api\V1\Storefront;

use App\Enums\ReviewStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\StoreReviewRequest;
use App\Models\Order;
use App\Models\Product;
use App\Models\Review;
use App\Support\PhoneNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class ReviewController extends Controller
{
    /**
     * New reviews wait for owner approval. Matching order number + phone marks it a verified purchase.
     */
    public function store(StoreReviewRequest $request, string $slug): JsonResponse
    {
        $product = Product::query()->published()->where('slug', $slug)->firstOrFail(['id']);
        $data = $request->validated();

        $orderId = null;
        if (! empty($data['order_number'])) {
            $orderId = Order::query()
                ->where('order_number', Str::upper(trim($data['order_number'])))
                ->where('customer_phone', PhoneNumber::normalize($data['phone'] ?? null) ?? '__invalid__')
                ->whereHas('items', fn ($query) => $query->where('product_id', $product->id))
                ->value('id');
        }

        Review::query()->create([
            'product_id' => $product->id,
            'order_id' => $orderId,
            'customer_name' => strip_tags($data['customer_name']),
            'rating' => $data['rating'],
            'comment' => strip_tags($data['comment']),
            'source' => 'website',
            'status' => ReviewStatus::Pending,
            'ip_address' => $request->ip(),
        ]);

        return response()->json(['message' => 'Thank you! Your review will appear after approval.'], 201);
    }
}
