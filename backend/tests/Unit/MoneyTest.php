<?php

namespace Tests\Unit;

use App\Support\Money;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

class MoneyTest extends TestCase
{
    #[Test]
    public function it_adds_without_float_drift(): void
    {
        $this->assertSame('0.30', Money::add('0.10', '0.20'));
    }

    #[Test]
    public function proportion_rounds_half_up(): void
    {
        $this->assertSame('33.33', Money::proportion('100', 1, 3));
        $this->assertSame('66.67', Money::proportion('100', 2, 3));
        $this->assertSame('0.01', Money::proportion('0.005', 1, 1));
    }

    #[Test]
    public function percent_of_amount(): void
    {
        $this->assertSame('124.50', Money::percentOf('1245.00', '10'));
    }

    #[Test]
    public function proportion_with_zero_denominator_is_zero(): void
    {
        $this->assertSame('0.00', Money::proportion('100', 1, 0));
    }
}
