<?php

namespace App\Services;

use App\Enums\OrderSource;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentRecordStatus;
use App\Enums\PaymentStatus;
use App\Enums\ProductStatus;
use App\Enums\RefundReason;
use App\Enums\SalesChannel;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\InvalidOrderStateException;
use App\Models\Customer;
use App\Models\DeliveryZone;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\ProductVariant;
use App\Models\User;
use App\Support\Money;
use App\Support\PhoneNumber;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Creates and moves orders. Website checkout and manual (POS / Facebook / WhatsApp) sales
 * share the same creation path, stock rules and money math.
 */
class OrderService
{
    public function __construct(
        private InventoryService $inventory,
        private PricingService $pricing,
        private CouponService $coupons,
        private PaymentService $payments,
    ) {}

    /**
     * @param  array{
     *     customer: array{name: string, phone: string, email?: string|null},
     *     shipping: array{address: string, area?: string|null, city: string, delivery_zone_id: int},
     *     items: list<array{variant_id: int, quantity: int}>,
     *     coupon_code?: string|null,
     *     payment: array{method: string, sender_number?: string|null, transaction_id?: string|null},
     *     note?: string|null,
     * }  $data
     */
    public function placeWebsiteOrder(array $data, ?string $ipAddress = null): Order
    {
        return DB::transaction(function () use ($data, $ipAddress) {
            $zone = DeliveryZone::query()->active()->find($data['shipping']['delivery_zone_id']);

            if ($zone === null) {
                throw ValidationException::withMessages(['shipping.delivery_zone_id' => ['Please choose a delivery area.']]);
            }

            $method = PaymentMethod::from($data['payment']['method']);

            $order = $this->createOrder(
                source: OrderSource::Website,
                channel: SalesChannel::Website,
                status: OrderStatus::Pending,
                method: $method,
                items: $data['items'],
                customer: $data['customer'],
                shipping: $data['shipping'] + ['zone' => $zone],
                deliveryCharge: Money::of($zone->charge),
                couponCode: $data['coupon_code'] ?? null,
                manualDiscount: '0',
                note: $data['note'] ?? null,
                user: null,
                ipAddress: $ipAddress,
                allowPriceOverride: false,
            );

            if ($method === PaymentMethod::Bkash) {
                $this->payments->recordPayment($order, [
                    'method' => PaymentMethod::Bkash,
                    'amount' => $order->grand_total,
                    'status' => PaymentRecordStatus::Pending,
                    'transaction_id' => $data['payment']['transaction_id'] ?? null,
                    'sender_number' => PhoneNumber::normalize($data['payment']['sender_number'] ?? null),
                ]);
            }

            return $order->refresh();
        });
    }

    /**
     * Sale recorded by staff for Facebook, WhatsApp, Instagram, the physical store, etc.
     *
     * @param  array{
     *     channel: string,
     *     status: string,
     *     customer?: array{name?: string|null, phone?: string|null, email?: string|null}|null,
     *     shipping?: array{address?: string|null, area?: string|null, city?: string|null, delivery_zone_id?: int|null}|null,
     *     items: list<array{variant_id: int, quantity: int, unit_price?: string|null}>,
     *     manual_discount?: string|null,
     *     coupon_code?: string|null,
     *     delivery_charge?: string|null,
     *     payment: array{method: string, amount?: string|null, transaction_id?: string|null, sender_number?: string|null},
     *     note?: string|null,
     * }  $data
     */
    public function createManualSale(array $data, User $user): Order
    {
        return DB::transaction(function () use ($data, $user) {
            $status = OrderStatus::from($data['status']);

            if (! in_array($status, [OrderStatus::Delivered, OrderStatus::Confirmed], true)) {
                throw ValidationException::withMessages(['status' => ['A manual sale starts as delivered or confirmed.']]);
            }

            $shipping = $data['shipping'] ?? [];
            $zone = isset($shipping['delivery_zone_id']) ? DeliveryZone::query()->find($shipping['delivery_zone_id']) : null;
            $deliveryCharge = $data['delivery_charge'] ?? ($zone?->charge ?? '0');
            $method = PaymentMethod::from($data['payment']['method']);

            $order = $this->createOrder(
                source: OrderSource::Manual,
                channel: SalesChannel::from($data['channel']),
                status: $status,
                method: $method,
                items: $data['items'],
                customer: $data['customer'] ?? [],
                shipping: $shipping + ['zone' => $zone],
                deliveryCharge: Money::of($deliveryCharge),
                couponCode: $data['coupon_code'] ?? null,
                manualDiscount: Money::of($data['manual_discount'] ?? '0'),
                note: $data['note'] ?? null,
                user: $user,
                ipAddress: null,
                allowPriceOverride: true,
            );

            $amount = $data['payment']['amount'] ?? ($status === OrderStatus::Delivered ? $order->grand_total : null);

            if ($amount !== null && Money::isPositive($amount)) {
                $this->payments->recordPayment($order, [
                    'method' => $method,
                    'amount' => Money::min($amount, $order->grand_total),
                    'transaction_id' => $data['payment']['transaction_id'] ?? null,
                    'sender_number' => PhoneNumber::normalize($data['payment']['sender_number'] ?? null),
                ], $user);
            }

            return $order->refresh();
        });
    }

    /**
     * Move an order to a new status and apply the matching stock effects.
     *
     * @param  array{note?: string|null, courier_name?: string|null, tracking_code?: string|null, delivery_cost?: string|null, cod_fee?: string|null}  $meta
     */
    public function transition(Order $order, OrderStatus $target, ?User $user = null, array $meta = []): Order
    {
        return DB::transaction(function () use ($order, $target, $user, $meta) {
            /** @var Order $order */
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);
            $from = $order->status;

            if (! $from->canTransitionTo($target)) {
                throw new InvalidOrderStateException("Cannot change order from {$from->value} to {$target->value}.");
            }

            $items = $order->items()->get();
            $variants = $this->inventory->lockVariants($items->pluck('variant_id')->filter());

            if ($from->holdsReservation() && $target === OrderStatus::Cancelled) {
                $this->eachItemVariant($items, $variants, fn (OrderItem $item, ProductVariant $variant) => $this->inventory->release($variant, $item->quantity, $item, $user));
                $this->coupons->releaseUsage($order);
            }

            if ($from->holdsReservation() && in_array($target, [OrderStatus::Shipped, OrderStatus::Delivered], true)) {
                $this->eachItemVariant($items, $variants, fn (OrderItem $item, ProductVariant $variant) => $this->inventory->sellReserved($variant, $item->quantity, $item, $user));
            }

            if ($target === OrderStatus::Returned) {
                $this->eachItemVariant($items, $variants, function (OrderItem $item, ProductVariant $variant) use ($user): void {
                    $remaining = $item->returnableQuantity();

                    if ($remaining > 0) {
                        $this->inventory->receiveReturn($variant, $remaining, 0, $item, $user);
                        $item->increment('returned_quantity', $remaining);
                    }
                });
            }

            $order->fill(array_filter([
                'courier_name' => $meta['courier_name'] ?? null,
                'tracking_code' => $meta['tracking_code'] ?? null,
                'delivery_cost' => isset($meta['delivery_cost']) ? Money::of($meta['delivery_cost']) : null,
            ], fn ($value) => $value !== null));

            $this->setStatus($order, $target, $user, $meta['note'] ?? null);

            if ($target === OrderStatus::Delivered && $order->payment_method === PaymentMethod::CashOnDelivery) {
                $due = $this->payments->amountDue($order);

                if (Money::isPositive($due)) {
                    $this->payments->recordPayment($order, [
                        'method' => PaymentMethod::CashOnDelivery,
                        'amount' => $due,
                        'fee' => $meta['cod_fee'] ?? '0',
                        'note' => 'Collected on delivery',
                    ], $user);
                }
            }

            return $order->refresh();
        });
    }

    /**
     * Partial or full return of shipped / delivered items.
     *
     * @param  list<array{order_item_id: int, quantity: int, damaged?: int|null}>  $returns
     * @param  array{amount: string, method: string, note?: string|null}|null  $refund
     */
    public function processReturn(Order $order, array $returns, ?array $refund, User $user): Order
    {
        return DB::transaction(function () use ($order, $returns, $refund, $user) {
            /** @var Order $order */
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);

            if (! in_array($order->status, [OrderStatus::Shipped, OrderStatus::Delivered], true)) {
                throw new InvalidOrderStateException('Only shipped or delivered orders can have returns.');
            }

            $items = $order->items()->get()->keyBy('id');
            $variants = $this->inventory->lockVariants($items->pluck('variant_id')->filter());

            foreach ($returns as $index => $line) {
                $item = $items->get($line['order_item_id']);
                $quantity = (int) $line['quantity'];
                $damaged = (int) ($line['damaged'] ?? 0);

                if ($item === null) {
                    throw ValidationException::withMessages(["items.{$index}.order_item_id" => ['Item does not belong to this order.']]);
                }

                if ($quantity < 1 || $quantity > $item->returnableQuantity() || $damaged < 0 || $damaged > $quantity) {
                    throw ValidationException::withMessages(["items.{$index}.quantity" => ["Can return at most {$item->returnableQuantity()} of {$item->product_name}."]]);
                }

                $variant = $variants->get($item->variant_id);

                if ($variant !== null) {
                    $this->inventory->receiveReturn($variant, $quantity - $damaged, $damaged, $item, $user);
                }

                $item->returned_quantity += $quantity;
                $item->damaged_quantity += $damaged;
                $item->save();
            }

            if ($refund !== null && Money::isPositive($refund['amount'])) {
                $this->payments->refund($order, $refund['amount'], PaymentMethod::from($refund['method']), RefundReason::Return, $user, $refund['note'] ?? null);
            }

            if ($items->every(fn (OrderItem $item) => $item->returnableQuantity() === 0)) {
                $this->setStatus($order, OrderStatus::Returned, $user, 'All items returned');
            }

            return $order->refresh();
        });
    }

    /**
     * @param  list<array{variant_id: int, quantity: int, unit_price?: string|null}>  $items
     * @param  array{name?: string|null, phone?: string|null, email?: string|null}  $customer
     * @param  array{address?: string|null, area?: string|null, city?: string|null, zone?: DeliveryZone|null}  $shipping
     */
    private function createOrder(
        OrderSource $source,
        SalesChannel $channel,
        OrderStatus $status,
        PaymentMethod $method,
        array $items,
        array $customer,
        array $shipping,
        string $deliveryCharge,
        ?string $couponCode,
        string $manualDiscount,
        ?string $note,
        ?User $user,
        ?string $ipAddress,
        bool $allowPriceOverride,
    ): Order {
        $items = $this->mergeDuplicateLines($items);
        $variants = $this->inventory->lockVariants(array_column($items, 'variant_id'));
        $phone = PhoneNumber::normalize($customer['phone'] ?? null);

        $lines = [];
        foreach ($items as $index => $line) {
            $variant = $variants->get($line['variant_id']);

            if ($variant === null || ! $this->isSellable($variant, $source)) {
                throw ValidationException::withMessages(["items.{$index}.variant_id" => ['This product is no longer available.']]);
            }

            if (! $variant->canFulfil($line['quantity'])) {
                throw InsufficientStockException::forItem($index, $variant->product->name, max(0, $variant->availableStock()));
            }

            $lines[] = [
                'variant' => $variant,
                'quantity' => $line['quantity'],
                'unit_price' => $allowPriceOverride ? ($line['unit_price'] ?? null) : null,
            ];
        }

        $coupon = null;
        $couponDiscount = '0';
        if ($couponCode !== null && trim($couponCode) !== '') {
            $subtotal = $this->pricing->calculate($lines)['items_subtotal'];
            $coupon = $this->coupons->resolve($couponCode, $subtotal, $phone, lock: true);
            $couponDiscount = $this->coupons->discountFor($coupon, $subtotal);
        }

        $totals = $this->pricing->calculate($lines, $couponDiscount, $manualDiscount, $deliveryCharge);
        $customerModel = $phone !== null ? $this->upsertCustomer($phone, $customer, $shipping) : null;
        $zone = $shipping['zone'] ?? null;

        $order = Order::query()->create([
            'uuid' => (string) Str::uuid(),
            'source' => $source,
            'channel' => $channel,
            'status' => $status,
            'payment_status' => PaymentStatus::Unpaid,
            'payment_method' => $method,
            'customer_id' => $customerModel?->id,
            'customer_name' => $customer['name'] ?? $customerModel?->name,
            'customer_phone' => $phone,
            'customer_email' => $customer['email'] ?? null,
            'shipping_address' => $shipping['address'] ?? null,
            'shipping_area' => $shipping['area'] ?? null,
            'shipping_city' => $shipping['city'] ?? null,
            'delivery_zone_id' => $zone?->id,
            'delivery_zone_name' => $zone?->name,
            'items_subtotal' => $totals['items_subtotal'],
            'coupon_discount' => $totals['coupon_discount'],
            'manual_discount' => $totals['manual_discount'],
            'delivery_charge' => $totals['delivery_charge'],
            'grand_total' => $totals['grand_total'],
            'cogs_total' => $totals['cogs_total'],
            'coupon_id' => $coupon?->id,
            'coupon_code' => $coupon?->code,
            'customer_note' => $note,
            'created_by' => $user?->id,
            'ip_address' => $ipAddress,
            'placed_at' => now(),
        ]);

        $order->forceFill(['order_number' => config('store.order_number_prefix').(100000 + $order->id)]);
        if ($timestampColumn = $status->timestampColumn()) {
            $order->{$timestampColumn} = now();
        }
        if ($status === OrderStatus::Delivered) {
            $order->confirmed_at = now();
            $order->shipped_at = now();
        }
        $order->save();

        foreach ($totals['lines'] as $line) {
            /** @var ProductVariant $variant */
            $variant = $line['variant'];

            $item = $order->items()->create([
                'product_id' => $variant->product_id,
                'variant_id' => $variant->id,
                'product_name' => $variant->product->name,
                'variant_title' => $variant->title,
                'sku' => $variant->sku,
                'unit_price' => $line['unit_price'],
                'unit_cost' => $line['unit_cost'],
                'cost_breakdown' => $variant->costBreakdown(),
                'quantity' => $line['quantity'],
                'line_subtotal' => $line['line_subtotal'],
                'discount_allocated' => $line['discount_allocated'],
                'line_total' => $line['line_total'],
            ]);

            $status === OrderStatus::Delivered
                ? $this->inventory->sellDirect($variant, $line['quantity'], $item, $user)
                : $this->inventory->reserve($variant, $line['quantity'], $item);
        }

        if ($coupon !== null) {
            $this->coupons->recordUsage($coupon, $order, $totals['coupon_discount']);
        }

        $this->recordHistory($order, null, $status, $user, $source === OrderSource::Website ? 'Order placed on website' : "Recorded by staff ({$channel->label()})");

        return $order;
    }

    private function isSellable(ProductVariant $variant, OrderSource $source): bool
    {
        if (! $variant->is_active) {
            return false;
        }

        return $source === OrderSource::Website
            ? $variant->product->status === ProductStatus::Active
            : $variant->product->status !== ProductStatus::Archived;
    }

    /**
     * Two cart lines for the same variant become one line.
     *
     * @param  list<array{variant_id: int, quantity: int, unit_price?: string|null}>  $items
     * @return list<array{variant_id: int, quantity: int, unit_price?: string|null}>
     */
    private function mergeDuplicateLines(array $items): array
    {
        $merged = [];
        foreach ($items as $line) {
            $id = (int) $line['variant_id'];
            if (isset($merged[$id])) {
                $merged[$id]['quantity'] += (int) $line['quantity'];
            } else {
                $merged[$id] = ['variant_id' => $id, 'quantity' => (int) $line['quantity'], 'unit_price' => $line['unit_price'] ?? null];
            }
        }

        return array_values($merged);
    }

    /**
     * @param  array{name?: string|null, email?: string|null}  $customer
     * @param  array{address?: string|null, area?: string|null, city?: string|null, zone?: DeliveryZone|null}  $shipping
     */
    private function upsertCustomer(string $phone, array $customer, array $shipping): Customer
    {
        $model = Customer::query()->firstOrNew(['phone' => $phone]);
        $model->name = $customer['name'] ?? $model->name ?? 'Customer';
        $model->email = $customer['email'] ?? $model->email;
        $model->save();

        $address = trim((string) ($shipping['address'] ?? ''));
        if ($address !== '' && ! empty($shipping['city'])) {
            $model->addresses()->updateOrCreate(
                ['address_line' => $address, 'city' => $shipping['city']],
                ['area' => $shipping['area'] ?? null, 'delivery_zone_id' => ($shipping['zone'] ?? null)?->id, 'is_default' => true],
            );
        }

        return $model;
    }

    /**
     * @param  Collection<int, OrderItem>  $items
     * @param  Collection<int, ProductVariant>  $variants
     */
    private function eachItemVariant(Collection $items, Collection $variants, callable $callback): void
    {
        foreach ($items as $item) {
            $variant = $variants->get($item->variant_id);

            if ($variant !== null) {
                $callback($item, $variant);
            }
        }
    }

    private function setStatus(Order $order, OrderStatus $target, ?User $user, ?string $note): void
    {
        $from = $order->status;
        $order->status = $target;

        if ($column = $target->timestampColumn()) {
            $order->{$column} = now();
        }

        $order->save();
        $this->recordHistory($order, $from, $target, $user, $note);
    }

    private function recordHistory(Order $order, ?OrderStatus $from, OrderStatus $to, ?User $user, ?string $note): void
    {
        OrderStatusHistory::query()->create([
            'order_id' => $order->id,
            'from_status' => $from,
            'to_status' => $to,
            'user_id' => $user?->id,
            'note' => $note,
        ]);
    }
}
