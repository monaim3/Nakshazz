<?php

namespace App\Http\Resources\Storefront;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Support\PhoneNumber;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * What a customer may see about their own order: no costs, no internal notes, no staff names.
 *
 * @mixin Order
 */
class CustomerOrderResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'order_number' => $this->order_number,
            'uuid' => $this->uuid,
            'status' => $this->status,
            'payment_status' => $this->payment_status,
            'payment_method' => $this->payment_method,
            'payment_method_label' => $this->payment_method->label(),
            'placed_at' => $this->placed_at?->toIso8601String(),
            'customer_name' => $this->customer_name,
            'customer_phone' => PhoneNumber::mask($this->customer_phone),
            'shipping_city' => $this->shipping_city,
            'delivery_zone' => $this->delivery_zone_name,
            'courier_name' => $this->courier_name,
            'tracking_code' => $this->tracking_code,
            'items' => $this->items->map(fn (OrderItem $item) => [
                'product_name' => $item->product_name,
                'variant_title' => $item->variant_title,
                'quantity' => $item->quantity,
                'unit_price' => $item->unit_price,
                'line_subtotal' => $item->line_subtotal,
            ]),
            'totals' => [
                'items_subtotal' => $this->items_subtotal,
                'discount' => $this->totalDiscount(),
                'delivery_charge' => $this->delivery_charge,
                'grand_total' => $this->grand_total,
            ],
            'timeline' => $this->statusHistories->map(fn (OrderStatusHistory $history) => [
                'status' => $history->to_status,
                'at' => $history->created_at?->toIso8601String(),
            ]),
        ];
    }
}
