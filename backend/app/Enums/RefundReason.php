<?php

namespace App\Enums;

enum RefundReason: string
{
    /** Money back for returned items. Revenue is already reduced by the return, so reports ignore it. */
    case Return = 'return';

    /** Goodwill money back with no items returned. Reports deduct it. */
    case Compensation = 'compensation';
}
