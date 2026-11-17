<?php

namespace App\Enums;

enum MovementType: string
{
    case Purchase = 'purchase';
    case AdjustmentIn = 'adjustment_in';
    case AdjustmentOut = 'adjustment_out';
    case Reserve = 'reserve';
    case Release = 'release';
    case Sale = 'sale';
    case Return = 'return';
    case ReturnDamaged = 'return_damaged';
}
