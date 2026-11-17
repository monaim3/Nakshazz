<?php

namespace App\Enums;

enum PaymentRecordStatus: string
{
    case Pending = 'pending';
    case Verified = 'verified';
    case Rejected = 'rejected';
}
