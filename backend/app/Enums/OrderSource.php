<?php

namespace App\Enums;

enum OrderSource: string
{
    case Website = 'website';
    case Manual = 'manual';
}
