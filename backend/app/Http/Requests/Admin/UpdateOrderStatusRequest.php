<?php

namespace App\Http\Requests\Admin;

use App\Enums\OrderStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateOrderStatusRequest extends FormRequest
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
        $money = ['nullable', 'numeric', 'min:0', 'max:999999', 'decimal:0,2'];

        return [
            'status' => ['required', Rule::enum(OrderStatus::class)],
            'note' => ['nullable', 'string', 'max:255'],
            'courier_name' => ['nullable', 'string', 'max:50'],
            'tracking_code' => ['nullable', 'string', 'max:100'],
            'delivery_cost' => $money,
            'cod_fee' => $money,
        ];
    }
}
