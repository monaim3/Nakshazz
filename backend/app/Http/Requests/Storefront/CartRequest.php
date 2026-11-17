<?php

namespace App\Http\Requests\Storefront;

use App\Rules\BangladeshiPhone;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Used by cart validation and coupon preview.
 */
class CartRequest extends FormRequest
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
            'items' => ['required', 'array', 'min:1', 'max:30'],
            'items.*.variant_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:20'],
            'coupon_code' => [$this->routeIs('*.coupons.apply') ? 'required' : 'nullable', 'string', 'max:40'],
            'phone' => ['nullable', 'string', new BangladeshiPhone],
            'delivery_zone_id' => ['nullable', 'integer'],
        ];
    }
}
