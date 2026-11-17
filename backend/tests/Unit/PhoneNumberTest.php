<?php

namespace Tests\Unit;

use App\Support\PhoneNumber;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

class PhoneNumberTest extends TestCase
{
    /**
     * @return array<string, array{0: string, 1: string|null}>
     */
    public static function numbers(): array
    {
        return [
            'local' => ['01712345678', '01712345678'],
            'with +880' => ['+8801712345678', '01712345678'],
            'with 880' => ['8801712345678', '01712345678'],
            'spaces and dashes' => ['017-1234 5678', '01712345678'],
            'too short' => ['0171234567', null],
            'invalid operator digit' => ['01212345678', null],
            'landline' => ['029876543', null],
        ];
    }

    #[Test]
    #[DataProvider('numbers')]
    public function it_normalizes_bangladeshi_mobile_numbers(string $input, ?string $expected): void
    {
        $this->assertSame($expected, PhoneNumber::normalize($input));
    }
}
