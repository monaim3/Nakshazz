<?php

namespace App\Http\Controllers\Api\V1\Storefront;

use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\CheckoutRequest;
use App\Http\Resources\Storefront\CustomerOrderResource;
use App\Services\OrderService;
use Illuminate\Http\JsonResponse;

class CheckoutController extends Controller
{
    public function __invoke(CheckoutRequest $request, OrderService $orders): JsonResponse
    {
        $order = $orders->placeWebsiteOrder($request->safe()->except('website'), $request->ip());

        $order->load(['items', 'statusHistories']);

        return (new CustomerOrderResource($order))->response()->setStatusCode(201);
    }
}
