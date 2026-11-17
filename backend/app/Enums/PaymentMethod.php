<?php

namespace App\Enums;

enum PaymentMethod: string
{
    case CashOnDelivery = 'cod';
    case Cash = 'cash';
    case Bkash = 'bkash';
    case MobileBanking = 'mobile_banking';
    case BankTransfer = 'bank_transfer';
    case OnlineGateway = 'online_gateway';
    case Other = 'other';

    /**
     * Methods a customer may pick on the website checkout.
     *
     * @return list<self>
     */
    public static function storefrontMethods(): array
    {
        return [self::CashOnDelivery, self::Bkash];
    }

    public function requiresTransactionId(): bool
    {
        return $this === self::Bkash;
    }

    public function label(): string
    {
        return match ($this) {
            self::CashOnDelivery => 'Cash on Delivery',
            self::Cash => 'Cash',
            self::Bkash => 'bKash',
            self::MobileBanking => 'Mobile Banking (Nagad/Rocket)',
            self::BankTransfer => 'Bank Transfer',
            self::OnlineGateway => 'Online Payment',
            self::Other => 'Other',
        };
    }
}
