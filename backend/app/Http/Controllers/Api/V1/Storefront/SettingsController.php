<?php

namespace App\Http\Controllers\Api\V1\Storefront;

use App\Enums\PaymentMethod;
use App\Http\Controllers\Controller;
use App\Models\DeliveryZone;
use App\Services\StoreSettings;
use Illuminate\Http\JsonResponse;

class SettingsController extends Controller
{
    public function __invoke(StoreSettings $settings): JsonResponse
    {
        $public = $settings->publicValues();

        $paymentMethods = collect(PaymentMethod::storefrontMethods())
            ->filter(fn (PaymentMethod $method) => match ($method) {
                PaymentMethod::CashOnDelivery => (bool) ($public['cod_enabled'] ?? true),
                PaymentMethod::Bkash => (bool) ($public['bkash_enabled'] ?? true),
                default => false,
            })
            ->map(fn (PaymentMethod $method) => ['value' => $method->value, 'label' => $method->label()])
            ->values();

        return response()->json(['data' => [
            'store' => $public,
            'delivery_zones' => DeliveryZone::query()->active()->get(['id', 'name', 'charge']),
            'payment_methods' => $paymentMethods,
        ]]);
    }
}
