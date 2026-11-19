<?php

namespace App\Enums;

/**
 * Where a piece is placed in the virtual try-on.
 * The size means: earring = drop length, necklace = width across, nose = width of the pin.
 */
enum TryOnType: string
{
    case Earring = 'earring';
    case Necklace = 'necklace';
    case Nose = 'nose';

    public function defaultSizeMm(): int
    {
        return match ($this) {
            self::Earring => 45,
            self::Necklace => 150,
            self::Nose => 8,
        };
    }
}
