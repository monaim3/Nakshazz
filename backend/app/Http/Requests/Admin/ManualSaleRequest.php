<?php

namespace App\Http\Requests\Admin;

use App\Enums\PaymentMethod;
use App\Enums\SalesChannel;
use App\Rules\BangladeshiPhone;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ManualSaleRequest extends FormRequest
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
        $money = ['numeric', 'min:0', 'max:9999999', 'decimal:0,2'];
        $needsShipping = $this->input('status') === 'confirmed';

        return [
            'channel' => ['required', Rule::enum(SalesChannel::class)],
            'status' => ['required', Rule::in(['delivered', 'confirmed'])],

            'customer.name' => ['nullable', 'string', 'max:100'],
            'customer.phone' => [$needsShipping ? 'required' : 'nullable', 'string', new BangladeshiPhone],
            'customer.email' => ['nullable', 'email:rfc', 'max:150'],

            'shipping.address' => [$needsShipping ? 'required' : 'nullable', 'string', 'max:255'],
            'shipping.area' => ['nullable', 'string', 'max:100'],
            'shipping.city' => [$needsShipping ? 'required' : 'nullable', 'string', 'max:100'],
            'shipping.delivery_zone_id' => ['nullable', 'integer', Rule::exists('delivery_zones', 'id')],

            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.variant_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:1000'],
            'items.*.unit_price' => ['nullable', ...$money],

            'manual_discount' => ['nullable', ...$money],
            'coupon_code' => ['nullable', 'string', 'max:40'],
            'delivery_charge' => ['nullable', ...$money],

            'payment.method' => ['required', Rule::enum(PaymentMethod::class)],
            'payment.amount' => ['nullable', ...$money],
            'payment.transaction_id' => ['nullable', 'string', 'max:60'],
            'payment.sender_number' => ['nullable', 'string', new BangladeshiPhone],

            'note' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
