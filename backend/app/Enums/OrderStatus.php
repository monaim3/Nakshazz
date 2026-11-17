<?php

namespace App\Enums;

enum OrderStatus: string
{
    case Pending = 'pending';
    case Confirmed = 'confirmed';
    case Processing = 'processing';
    case Shipped = 'shipped';
    case Delivered = 'delivered';
    case Cancelled = 'cancelled';
    case Returned = 'returned';

    /**
     * Statuses this status may move to.
     *
     * @return list<self>
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::Pending => [self::Confirmed, self::Cancelled],
            self::Confirmed => [self::Processing, self::Shipped, self::Delivered, self::Cancelled],
            self::Processing => [self::Shipped, self::Delivered, self::Cancelled],
            self::Shipped => [self::Delivered, self::Returned],
            self::Delivered => [self::Returned],
            self::Cancelled, self::Returned => [],
        };
    }

    public function canTransitionTo(self $target): bool
    {
        return in_array($target, $this->allowedTransitions(), true);
    }

    /**
     * Stock for these orders is still held as "reserved" (not yet taken out of on-hand).
     */
    public function holdsReservation(): bool
    {
        return in_array($this, [self::Pending, self::Confirmed, self::Processing], true);
    }

    /**
     * Profit on these orders is an estimate, not yet earned.
     */
    public function isOpen(): bool
    {
        return in_array($this, [self::Pending, self::Confirmed, self::Processing, self::Shipped], true);
    }

    public function timestampColumn(): ?string
    {
        return match ($this) {
            self::Confirmed => 'confirmed_at',
            self::Shipped => 'shipped_at',
            self::Delivered => 'delivered_at',
            self::Cancelled => 'cancelled_at',
            self::Returned => 'returned_at',
            default => null,
        };
    }

    public function label(): string
    {
        return ucfirst($this->value);
    }
}
