<?php

namespace App\Http\Requests\Admin;

use App\Enums\PaymentMethod;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class OrderReturnRequest extends FormRequest
{
    /**
     * Returning goods is staff work; giving money back is owner-only.
     */
    public function authorize(): bool
    {
        return ! $this->filled('refund.amount') || (bool) $this->user()?->can('view-financials');
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1'],
            'items.*.order_item_id' => ['required', 'integer', 'distinct'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.damaged' => ['nullable', 'integer', 'min:0'],
            'refund' => ['nullable', 'array'],
            'refund.amount' => ['required_with:refund', 'numeric', 'min:0.01', 'decimal:0,2'],
            'refund.method' => ['required_with:refund', Rule::enum(PaymentMethod::class)],
            'refund.note' => ['nullable', 'string', 'max:255'],
            'refund.transaction_id' => ['nullable', 'string', 'max:60'],
        ];
    }
}
