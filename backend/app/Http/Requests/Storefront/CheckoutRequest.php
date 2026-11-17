<?php

namespace App\Http\Requests\Storefront;

use App\Enums\PaymentMethod;
use App\Rules\BangladeshiPhone;
use App\Services\StoreSettings;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'customer.name' => ['required', 'string', 'min:2', 'max:100'],
            'customer.phone' => ['required', 'string', new BangladeshiPhone],
            'customer.email' => ['nullable', 'email:rfc', 'max:150'],

            'shipping.address' => ['required', 'string', 'min:5', 'max:255'],
            'shipping.area' => ['nullable', 'string', 'max:100'],
            'shipping.city' => ['required', 'string', 'max:100'],
            'shipping.delivery_zone_id' => ['required', 'integer'],

            'items' => ['required', 'array', 'min:1', 'max:30'],
            'items.*.variant_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:20'],

            'coupon_code' => ['nullable', 'string', 'max:40'],

            'payment.method' => ['required', Rule::in($this->enabledMethods())],
            'payment.sender_number' => ['exclude_unless:payment.method,bkash', 'required', 'string', new BangladeshiPhone],
            'payment.transaction_id' => ['exclude_unless:payment.method,bkash', 'required', 'string', 'regex:/^[A-Za-z0-9]{8,20}$/'],

            'note' => ['nullable', 'string', 'max:500'],

            // Honeypot: hidden in the form, real customers leave it empty.
            'website' => ['prohibited'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'payment.method.in' => 'Please choose an available payment method.',
            'payment.transaction_id.regex' => 'Enter the bKash Transaction ID (TrxID) exactly as shown in your bKash message.',
            'items.required' => 'Your bag is empty.',
        ];
    }

    /**
     * @return list<string>
     */
    private function enabledMethods(): array
    {
        $settings = app(StoreSettings::class);

        return array_values(array_filter([
            $settings->bool('cod_enabled', true) ? PaymentMethod::CashOnDelivery->value : null,
            $settings->bool('bkash_enabled', true) ? PaymentMethod::Bkash->value : null,
        ]));
    }
}
