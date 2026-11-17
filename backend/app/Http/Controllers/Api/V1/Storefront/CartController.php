<?php

namespace App\Http\Controllers\Api\V1\Storefront;

use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\CartRequest;
use App\Services\CartQuoteService;
use Illuminate\Http\JsonResponse;

class CartController extends Controller
{
    /**
     * Re-price the browser cart. Also used for coupon preview (same payload with coupon_code).
     */
    public function __invoke(CartRequest $request, CartQuoteService $quotes): JsonResponse
    {
        $data = $request->validated();

        return response()->json(['data' => $quotes->quote(
            $data['items'],
            $data['coupon_code'] ?? null,
            $data['phone'] ?? null,
            isset($data['delivery_zone_id']) ? (int) $data['delivery_zone_id'] : null,
        )]);
    }
}
