<?php

namespace App\Http\Requests\Storefront;

use App\Services\ProductCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProductIndexRequest extends FormRequest
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
            'q' => ['nullable', 'string', 'max:100'],
            'category' => ['nullable', 'string', 'max:120'],
            'min_price' => ['nullable', 'numeric', 'min:0'],
            'max_price' => ['nullable', 'numeric', 'min:0', Rule::when($this->filled('min_price'), 'gte:min_price')],
            'sort' => ['nullable', Rule::in(array_keys(ProductCatalog::SORTS))],
            'featured' => ['nullable', 'boolean'],
            'in_stock' => ['nullable', 'boolean'],
            'on_sale' => ['nullable', 'boolean'],
            'color' => ['nullable', 'string', 'max:200'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:48'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
