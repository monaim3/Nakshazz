<?php

namespace App\Http\Requests\Storefront;

use App\Rules\BangladeshiPhone;
use Illuminate\Foundation\Http\FormRequest;

class ContactRequest extends FormRequest
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
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'phone' => ['nullable', 'required_without:email', 'string', new BangladeshiPhone],
            'email' => ['nullable', 'required_without:phone', 'email:rfc', 'max:150'],
            'message' => ['required', 'string', 'min:10', 'max:2000'],
            'website' => ['prohibited'],
        ];
    }
}
