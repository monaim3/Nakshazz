<?php

namespace App\Rules;

use App\Support\PhoneNumber;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class BangladeshiPhone implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! PhoneNumber::isValid($value)) {
            $fail('Enter a valid Bangladeshi mobile number, e.g. 01712345678.');
        }
    }
}
