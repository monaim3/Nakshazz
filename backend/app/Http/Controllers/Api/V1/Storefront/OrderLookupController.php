<?php

namespace App\Http\Controllers\Api\V1\Storefront;

use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\TrackOrderRequest;
use App\Http\Resources\Storefront\CustomerOrderResource;
use App\Models\Order;
use App\Support\PhoneNumber;
use Illuminate\Support\Str;

class OrderLookupController extends Controller
{
    /**
     * Order number + phone. A wrong phone gives the same 404 as a wrong number,
     * so nobody can probe which order numbers exist.
     */
    public function track(TrackOrderRequest $request): CustomerOrderResource
    {
        $phone = PhoneNumber::normalize($request->validated('phone'));

        $order = Order::query()
            ->where('order_number', Str::upper(trim($request->validated('order_number'))))
            ->where('customer_phone', $phone ?? '__invalid__')
            ->with(['items', 'statusHistories'])
            ->first();

        abort_if($order === null, 404, 'No order found with that number and phone.');

        return new CustomerOrderResource($order);
    }

    /**
     * Thank-you page lookup by the unguessable UUID returned at checkout.
     */
    public function show(string $uuid): CustomerOrderResource
    {
        abort_unless(Str::isUuid($uuid), 404);

        $order = Order::query()->where('uuid', $uuid)->with(['items', 'statusHistories'])->firstOrFail();

        return new CustomerOrderResource($order);
    }
}
