<?php

namespace App\Services;

use App\Models\ProductVariant;
use App\Support\Money;

/**
 * Pure order math. No database writes.
 */
class PricingService
{
    /**
     * @param  list<array{variant: ProductVariant, quantity: int, unit_price?: string|null}>  $lines
     * @return array{
     *     lines: list<array{variant: ProductVariant, quantity: int, unit_price: string, unit_cost: string, line_subtotal: string, discount_allocated: string, line_total: string}>,
     *     items_subtotal: string,
     *     coupon_discount: string,
     *     manual_discount: string,
     *     delivery_charge: string,
     *     grand_total: string,
     *     cogs_total: string,
     * }
     */
    public function calculate(array $lines, string $couponDiscount = '0', string $manualDiscount = '0', string $deliveryCharge = '0'): array
    {
        $priced = [];
        $itemsSubtotal = '0.00';
        $cogsTotal = '0.00';

        foreach ($lines as $line) {
            $variant = $line['variant'];
            $unitPrice = Money::of($line['unit_price'] ?? $variant->price);
            $unitCost = Money::of($variant->total_cost);
            $lineSubtotal = Money::mul($unitPrice, $line['quantity']);

            $priced[] = [
                'variant' => $variant,
                'quantity' => $line['quantity'],
                'unit_price' => $unitPrice,
                'unit_cost' => $unitCost,
                'line_subtotal' => $lineSubtotal,
                'discount_allocated' => '0.00',
                'line_total' => $lineSubtotal,
            ];

            $itemsSubtotal = Money::add($itemsSubtotal, $lineSubtotal);
            $cogsTotal = Money::add($cogsTotal, Money::mul($unitCost, $line['quantity']));
        }

        // Discounts can never push product revenue below zero. Coupon is applied first.
        $couponDiscount = Money::min(Money::max($couponDiscount, '0'), $itemsSubtotal);
        $manualDiscount = Money::min(Money::max($manualDiscount, '0'), Money::sub($itemsSubtotal, $couponDiscount));
        $totalDiscount = Money::add($couponDiscount, $manualDiscount);

        $priced = $this->allocateDiscount($priced, $totalDiscount, $itemsSubtotal);
        $deliveryCharge = Money::max($deliveryCharge, '0');

        return [
            'lines' => $priced,
            'items_subtotal' => $itemsSubtotal,
            'coupon_discount' => $couponDiscount,
            'manual_discount' => $manualDiscount,
            'delivery_charge' => $deliveryCharge,
            'grand_total' => Money::add(Money::sub($itemsSubtotal, $totalDiscount), $deliveryCharge),
            'cogs_total' => $cogsTotal,
        ];
    }

    /**
     * Spread an order-level discount across lines in proportion to their subtotal.
     * The rounding remainder goes to the last line so the parts always add up exactly.
     *
     * @template T of array{line_subtotal: string, discount_allocated: string, line_total: string}
     *
     * @param  list<T>  $lines
     * @return list<T>
     */
    private function allocateDiscount(array $lines, string $totalDiscount, string $itemsSubtotal): array
    {
        if (Money::isZero($totalDiscount) || $lines === []) {
            return $lines;
        }

        $remaining = $totalDiscount;
        $lastIndex = array_key_last($lines);

        foreach ($lines as $index => $line) {
            $share = $index === $lastIndex
                ? $remaining
                : Money::min(Money::proportion($totalDiscount, $line['line_subtotal'], $itemsSubtotal), $remaining);

            $lines[$index]['discount_allocated'] = $share;
            $lines[$index]['line_total'] = Money::sub($line['line_subtotal'], $share);
            $remaining = Money::sub($remaining, $share);
        }

        return $lines;
    }
}
