<?php

namespace App\Models;

use App\Enums\OrderSource;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Enums\SalesChannel;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable([
    'uuid', 'source', 'channel', 'status', 'payment_status', 'payment_method',
    'customer_id', 'customer_name', 'customer_phone', 'customer_email',
    'shipping_address', 'shipping_area', 'shipping_city', 'delivery_zone_id', 'delivery_zone_name',
    'items_subtotal', 'coupon_discount', 'manual_discount', 'delivery_charge', 'grand_total',
    'cogs_total', 'delivery_cost', 'coupon_id', 'coupon_code', 'courier_name', 'tracking_code',
    'customer_note', 'created_by', 'ip_address', 'placed_at',
])]
class Order extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'source' => OrderSource::class,
            'channel' => SalesChannel::class,
            'status' => OrderStatus::class,
            'payment_status' => PaymentStatus::class,
            'payment_method' => PaymentMethod::class,
            'items_subtotal' => 'decimal:2',
            'coupon_discount' => 'decimal:2',
            'manual_discount' => 'decimal:2',
            'delivery_charge' => 'decimal:2',
            'grand_total' => 'decimal:2',
            'cogs_total' => 'decimal:2',
            'delivery_cost' => 'decimal:2',
            'placed_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'shipped_at' => 'datetime',
            'delivered_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'returned_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function deliveryZone(): BelongsTo
    {
        return $this->belongsTo(DeliveryZone::class);
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class);
    }

    public function couponUsage(): HasOne
    {
        return $this->hasOne(CouponUsage::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function statusHistories(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class)->orderBy('created_at')->orderBy('id');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(OrderNote::class)->orderByDesc('created_at')->orderByDesc('id');
    }

    public function returns(): HasMany
    {
        return $this->hasMany(OrderItemReturn::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->orderBy('id');
    }

    public function totalDiscount(): string
    {
        return bcadd((string) $this->coupon_discount, (string) $this->manual_discount, 2);
    }
}
