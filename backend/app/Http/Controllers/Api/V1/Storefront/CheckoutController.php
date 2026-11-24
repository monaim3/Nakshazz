<?php

namespace App\Http\Controllers\Api\V1\Storefront;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\CheckoutRequest;
use App\Http\Resources\Storefront\CustomerOrderResource;
use App\Models\User;
use App\Notifications\NewWebsiteOrder;
use App\Notifications\OrderPlacedCustomer;
use App\Services\OrderService;
use App\Services\StoreSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Notification;
use Throwable;

use function Illuminate\Support\defer;

class CheckoutController extends Controller
{
    public function __invoke(CheckoutRequest $request, OrderService $orders): JsonResponse
    {
        $order = $orders->placeWebsiteOrder($request->safe()->except('website'), $request->ip());

        $order->load(['items', 'statusHistories']);

        // tell the shop team by email once the customer has their answer: a slow or broken
        // mail server must never delay or fail a checkout (the host has no queue worker)
        defer(function () use ($order): void {
            try {
                // Settings → "Email new orders to"; when empty, the active owner account(s)
                $address = app(StoreSettings::class)->get('order_notification_email');
                $address
                    ? Notification::route('mail', $address)->notifyNow(new NewWebsiteOrder($order))
                    : Notification::sendNow(User::query()->where('is_active', true)->where('role', UserRole::Owner)->get(), new NewWebsiteOrder($order));
            } catch (Throwable $exception) {
                report($exception);
            }

            // the customer's own confirmation (order number + private link), if they gave an email
            try {
                if (filled($order->customer_email)) {
                    Notification::route('mail', $order->customer_email)->notifyNow(new OrderPlacedCustomer($order));
                }
            } catch (Throwable $exception) {
                report($exception);
            }
        });

        return (new CustomerOrderResource($order))->response()->setStatusCode(201);
    }
}
