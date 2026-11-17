<?php

namespace App\Http\Resources\Admin;

use App\Models\Order;
use App\Models\OrderItem;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Order
 */
class OrderResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $canSeeFinancials = (bool) $request->user()?->can('view-financials');

        return [
            'id' => $this->id,
            'uuid' => $this->uuid,
            'order_number' => $this->order_number,
            'source' => $this->source,
            'channel' => $this->channel,
            'channel_label' => $this->channel->label(),
            'status' => $this->status,
            'allowed_transitions' => $this->status->allowedTransitions(),
            'payment_status' => $this->payment_status,
            'payment_method' => $this->payment_method,
            'payment_method_label' => $this->payment_method->label(),
            'customer_id' => $this->customer_id,
            'customer_name' => $this->customer_name,
            'customer_phone' => $this->customer_phone,
            'customer_email' => $this->customer_email,
            'shipping' => [
                'address' => $this->shipping_address,
                'area' => $this->shipping_area,
                'city' => $this->shipping_city,
                'zone' => $this->delivery_zone_name,
            ],
            'items_subtotal' => $this->items_subtotal,
            'coupon_code' => $this->coupon_code,
            'coupon_discount' => $this->coupon_discount,
            'manual_discount' => $this->manual_discount,
            'delivery_charge' => $this->delivery_charge,
            'grand_total' => $this->grand_total,
            'delivery_cost' => $this->delivery_cost,
            $this->mergeWhen($canSeeFinancials, fn () => [
                'cogs_total' => $this->cogs_total,
                'estimated_gross_profit' => Money::sub(Money::sub($this->items_subtotal, $this->totalDiscount()), $this->cogs_total),
            ]),
            'courier_name' => $this->courier_name,
            'tracking_code' => $this->tracking_code,
            'customer_note' => $this->customer_note,
            'created_by' => $this->whenLoaded('creator', fn () => $this->creator?->only(['id', 'name'])),
            'placed_at' => $this->placed_at?->toIso8601String(),
            'confirmed_at' => $this->confirmed_at?->toIso8601String(),
            'shipped_at' => $this->shipped_at?->toIso8601String(),
            'delivered_at' => $this->delivered_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'returned_at' => $this->returned_at?->toIso8601String(),
            'items_count' => $this->whenCounted('items'),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn (OrderItem $item) => [
                'id' => $item->id,
                'product_id' => $item->product_id,
                'variant_id' => $item->variant_id,
                'product_name' => $item->product_name,
                'variant_title' => $item->variant_title,
                'sku' => $item->sku,
                'unit_price' => $item->unit_price,
                'quantity' => $item->quantity,
                'line_subtotal' => $item->line_subtotal,
                'discount_allocated' => $item->discount_allocated,
                'line_total' => $item->line_total,
                'returned_quantity' => $item->returned_quantity,
                'damaged_quantity' => $item->damaged_quantity,
                ...($canSeeFinancials ? ['unit_cost' => $item->unit_cost, 'cost_breakdown' => $item->cost_breakdown] : []),
            ])),
            'payments' => PaymentResource::collection($this->whenLoaded('payments')),
            'status_history' => $this->whenLoaded('statusHistories', fn () => $this->statusHistories->map(fn ($history) => [
                'from' => $history->from_status,
                'to' => $history->to_status,
                'note' => $history->note,
                'user' => $history->user?->only(['id', 'name']),
                'at' => $history->created_at?->toIso8601String(),
            ])),
            'notes' => $this->whenLoaded('notes', fn () => $this->notes->map(fn ($note) => [
                'id' => $note->id,
                'body' => $note->body,
                'user' => $note->user?->only(['id', 'name']),
                'at' => $note->created_at?->toIso8601String(),
            ])),
        ];
    }
}
