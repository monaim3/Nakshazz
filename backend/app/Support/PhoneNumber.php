<?php

namespace App\Support;

/**
 * Bangladeshi mobile numbers stored in one format: 01XXXXXXXXX (11 digits).
 */
final class PhoneNumber
{
    public const PATTERN = '/^01[3-9]\d{8}$/';

    /**
     * Returns the normalized number, or null when it is not a valid BD mobile number.
     * Accepts +8801…, 8801…, 01…, with spaces or dashes.
     */
    public static function normalize(?string $input): ?string
    {
        if ($input === null) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $input) ?? '';

        if (str_starts_with($digits, '880')) {
            $digits = substr($digits, 2);
        }

        return preg_match(self::PATTERN, $digits) === 1 ? $digits : null;
    }

    public static function isValid(?string $input): bool
    {
        return self::normalize($input) !== null;
    }

    /**
     * 017XXXXX678 style for places where the full number must not be shown.
     */
    public static function mask(?string $phone): ?string
    {
        if ($phone === null || strlen($phone) < 6) {
            return $phone;
        }

        return substr($phone, 0, 3).str_repeat('X', strlen($phone) - 6).substr($phone, -3);
    }
}
