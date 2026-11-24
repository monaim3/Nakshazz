<?php

namespace App\Http\Requests\Storefront;

use Illuminate\Foundation\Http\FormRequest;

class StoreReviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Tags are removed before the checks, so text made only of HTML ("<b></b>") counts as empty.
     */
    protected function prepareForValidation(): void
    {
        foreach (['customer_name', 'comment'] as $field) {
            if (is_string($this->input($field))) {
                $this->merge([$field => trim(strip_tags($this->input($field)))]);
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'customer_name' => ['required', 'string', 'min:2', 'max:100'],
            'rating' => ['required', 'integer', 'between:1,5'],
            'comment' => ['required', 'string', 'min:10', 'max:1000'],
            'order_number' => ['nullable', 'string', 'max:20'],
            'phone' => ['nullable', 'required_with:order_number', 'string', 'max:20'],
            'website' => ['prohibited'],
        ];
    }
}
