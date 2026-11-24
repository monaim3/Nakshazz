<?php

namespace App\Enums;

enum RefundReason: string
{
    /** Money back for returned items. The returned goods leave revenue on the return date; any part above their value is split into delivery and goodwill. */
    case Return = 'return';

    /** Goodwill money back with no items returned. Reports deduct it on the refund date. */
    case Compensation = 'compensation';

    /** Money back because the order was cancelled before it was delivered. Never income, so reports ignore it. */
    case Cancellation = 'cancellation';

    public function label(): string
    {
        return match ($this) {
            self::Return => 'Return',
            self::Compensation => 'Goodwill',
            self::Cancellation => 'Cancellation',
        };
    }
}
