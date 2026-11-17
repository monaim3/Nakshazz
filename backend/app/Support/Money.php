<?php

namespace App\Support;

/**
 * Exact decimal arithmetic for BDT amounts (2 decimal places) using bcmath.
 * Floats are never used for money.
 */
final class Money
{
    private const SCALE = 2;

    public static function of(string|int|float|null $value): string
    {
        return bcadd(self::normalize($value), '0', self::SCALE);
    }

    public static function add(string|int|float|null ...$values): string
    {
        $total = '0';
        foreach ($values as $value) {
            $total = bcadd($total, self::normalize($value), self::SCALE);
        }

        return $total;
    }

    public static function sub(string|int|float|null $left, string|int|float|null $right): string
    {
        return bcsub(self::normalize($left), self::normalize($right), self::SCALE);
    }

    public static function mul(string|int|float|null $amount, string|int|float $factor): string
    {
        return self::round(bcmul(self::normalize($amount), self::normalize($factor), 6));
    }

    /**
     * $amount × $numerator ÷ $denominator, rounded half-up to 2 dp.
     */
    public static function proportion(string|int|float|null $amount, string|int|float $numerator, string|int|float $denominator): string
    {
        if (bccomp(self::normalize($denominator), '0', 6) === 0) {
            return '0.00';
        }

        $scaled = bcmul(self::normalize($amount), self::normalize($numerator), 8);

        return self::round(bcdiv($scaled, self::normalize($denominator), 8));
    }

    public static function percentOf(string|int|float|null $amount, string|int|float $percent): string
    {
        return self::proportion($amount, $percent, 100);
    }

    public static function min(string|int|float|null $left, string|int|float|null $right): string
    {
        return self::compare($left, $right) <= 0 ? self::of($left) : self::of($right);
    }

    public static function max(string|int|float|null $left, string|int|float|null $right): string
    {
        return self::compare($left, $right) >= 0 ? self::of($left) : self::of($right);
    }

    public static function compare(string|int|float|null $left, string|int|float|null $right): int
    {
        return bccomp(self::normalize($left), self::normalize($right), self::SCALE);
    }

    public static function isPositive(string|int|float|null $value): bool
    {
        return self::compare($value, '0') > 0;
    }

    public static function isZero(string|int|float|null $value): bool
    {
        return self::compare($value, '0') === 0;
    }

    /**
     * Round half away from zero to 2 decimal places.
     */
    private static function round(string $value): string
    {
        $offset = str_starts_with($value, '-') ? '-0.005' : '0.005';

        return bcadd(bcadd($value, $offset, 8), '0', self::SCALE);
    }

    private static function normalize(string|int|float|null $value): string
    {
        if ($value === null || $value === '') {
            return '0';
        }

        if (is_float($value)) {
            return number_format($value, 8, '.', '');
        }

        return (string) $value;
    }
}
