<?php

namespace App\Enums;

enum SalesChannel: string
{
    case Website = 'website';
    case Facebook = 'facebook';
    case Whatsapp = 'whatsapp';
    case Instagram = 'instagram';
    case PhysicalStore = 'physical_store';
    case Other = 'other';

    public function label(): string
    {
        return match ($this) {
            self::Website => 'Website',
            self::Facebook => 'Facebook',
            self::Whatsapp => 'WhatsApp',
            self::Instagram => 'Instagram',
            self::PhysicalStore => 'Physical Store',
            self::Other => 'Other',
        };
    }
}
