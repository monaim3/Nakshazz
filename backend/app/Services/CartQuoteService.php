<?php

namespace App\Services;

use App\Enums\ProductStatus;
use App\Http\Resources\Storefront\ImageResource;
use App\Models\DeliveryZone;
use App\Models\ProductVariant;
use App\Support\PhoneNumber;
use Illuminate\Validation\ValidationException;

/**
 * Re-prices a browser cart against live data. Nothing is reserved or written.
 * Checkout repeats every check inside a locked transaction.
 */
class CartQuoteService
{
    public function __construct(
        private PricingService $pricing,
        private CouponService $coupons,
    ) {}

    /**
     * @param  list<array{variant_id: int, quantity: int}>  $items
     * @return array<string, mixed>
     */
    public function quote(array $items, ?string $couponCode = null, ?string $phone = null, ?int $deliveryZoneId = null): array
    {
        $variants = ProductVariant::query()
            ->with(['product:id,name,slug,status', 'product.primaryImage'])
            ->whereIn('id', array_column($items, 'variant_id'))
            ->get()
            ->keyBy('id');

        $lines = [];
        $pricedLines = [];

        foreach ($items as $item) {
            $variant = $variants->get($item['variant_id']);
            $requested = (int) $item['quantity'];

            if ($variant === null || ! $variant->is_active || $variant->product->status !== ProductStatus::Active) {
                $lines[] = ['variant_id' => (int) $item['variant_id'], 'requested_quantity' => $requested, 'quantity' => 0, 'problem' => 'unavailable'];

                continue;
            }

            $available = $variant->allow_backorder ? $requested : max(0, $variant->availableStock());
            $quantity = min($requested, $available);

            $lines[] = [
                'variant_id' => $variant->id,
                'product_name' => $variant->product->name,
                'product_slug' => $variant->product->slug,
                'variant_title' => $variant->title,
                'image' => $variant->product->primaryImage ? new ImageResource($variant->product->primaryImage) : null,
                'unit_price' => $variant->price,
                'compare_at_price' => $variant->compare_at_price,
                'requested_quantity' => $requested,
                'quantity' => $quantity,
                'line_subtotal' => bcmul((string) $variant->price, (string) $quantity, 2),
                'problem' => match (true) {
                    $quantity === 0 => 'out_of_stock',
                    $quantity < $requested => 'insufficient_stock',
                    default => null,
                },
            ];

            if ($quantity > 0) {
                $pricedLines[] = ['variant' => $variant, 'quantity' => $quantity];
            }
        }

        $subtotal = $this->pricing->calculate($pricedLines)['items_subtotal'];
        [$couponDiscount, $coupon] = $this->previewCoupon($couponCode, $subtotal, $phone);
        $zone = $deliveryZoneId ? DeliveryZone::query()->active()->find($deliveryZoneId) : null;

        $totals = $this->pricing->calculate($pricedLines, $couponDiscount, '0', $zone?->charge ?? '0');

        return [
            'lines' => $lines,
            'coupon' => $coupon,
            'delivery_zone' => $zone ? ['id' => $zone->id, 'name' => $zone->name, 'charge' => $zone->charge] : null,
            'totals' => [
                'items_subtotal' => $totals['items_subtotal'],
                'discount' => $totals['coupon_discount'],
                'delivery_charge' => $totals['delivery_charge'],
                'grand_total' => $totals['grand_total'],
            ],
            'has_problems' => collect($lines)->contains(fn (array $line) => $line['problem'] !== null),
        ];
    }

    /**
     * @return array{0: string, 1: array{code: string, valid: bool, discount: string|null, message: string|null}|null}
     */
    private function previewCoupon(?string $code, string $subtotal, ?string $phone): array
    {
        if ($code === null || trim($code) === '') {
            return ['0', null];
        }

        try {
            $coupon = $this->coupons->resolve($code, $subtotal, PhoneNumber::normalize($phone));
            $discount = $this->coupons->discountFor($coupon, $subtotal);

            return [$discount, ['code' => $coupon->code, 'valid' => true, 'discount' => $discount, 'message' => null]];
        } catch (ValidationException $exception) {
            return ['0', ['code' => strtoupper(trim($code)), 'valid' => false, 'discount' => null, 'message' => collect($exception->errors())->flatten()->first()]];
        }
    }
}
