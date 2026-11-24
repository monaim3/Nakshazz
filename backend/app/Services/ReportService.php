<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Enums\PaymentRecordStatus;
use App\Enums\PaymentType;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Carbon\CarbonPeriod;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Profit reports. Reads only order snapshots (unit_price, unit_cost), never live product data,
 * so changing a product's price or cost never changes past results.
 *
 * Owner's rules (2026-11-24), so a closed month never changes later:
 *  - A sale counts in full on its delivery date (orders returned before delivery count on
 *    their return date with only what was kept).
 *  - A return of a delivered order comes off revenue (and the cost of units back on the shelf)
 *    on the date it was returned. Damaged units stay a cost.
 *  - Refunded delivery charges lower delivery income, and refunds above the returned goods or
 *    goodwill refunds lower profit, on the date of the refund.
 *  - Estimated = open orders (pending → shipped), dated by when they were placed.
 */
class ReportService
{
    private const REALIZED_AT = 'COALESCE(orders.delivered_at, orders.returned_at)';

    /** Revenue of the sale: the full line for delivered orders; what was kept for orders returned before delivery. */
    private const SALE_REVENUE = 'CASE WHEN orders.delivered_at IS NULL THEN order_items.line_total * (order_items.quantity - order_items.returned_quantity) / order_items.quantity ELSE order_items.line_total END';

    /** Cost of the sale: all units for delivered orders; kept + damaged for orders returned before delivery. */
    private const SALE_COGS = 'order_items.unit_cost * CASE WHEN orders.delivered_at IS NULL THEN (order_items.quantity - order_items.returned_quantity + order_items.damaged_quantity) ELSE order_items.quantity END';

    private const SALE_UNITS = 'CASE WHEN orders.delivered_at IS NULL THEN order_items.quantity - order_items.returned_quantity ELSE order_items.quantity END';

    /**
     * @return array{
     *     realized: array<string, string|int>,
     *     estimated: array{orders: int, product_revenue: string, cogs: string, gross_profit: string},
     * }
     */
    public function summary(CarbonImmutable $from, CarbonImmutable $to): array
    {
        return [
            'realized' => $this->realizedSummary($from, $to),
            'estimated' => $this->estimatedSummary($from, $to),
        ];
    }

    /**
     * @return list<array{channel: string, orders: int, product_revenue: string, cogs: string, gross_profit: string}>
     */
    public function byChannel(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $sales = $this->realizedItems($from, $to)
            ->groupBy('orders.channel')
            ->selectRaw('orders.channel as k, COUNT(DISTINCT orders.id) as orders, SUM('.self::SALE_REVENUE.') as revenue, SUM('.self::SALE_COGS.') as cogs')
            ->get()->keyBy('k');
        $returns = $this->returnsInPeriod($from, $to)
            ->groupBy('orders.channel')
            ->selectRaw('orders.channel as k, SUM(r.value) as revenue, SUM(order_items.unit_cost * (r.quantity - r.damaged)) as cogs')
            ->get()->keyBy('k');

        return $this->merge($sales, $returns)
            ->sortKeys()
            ->map(fn (array $row, string $channel) => [
                'channel' => $channel,
                'orders' => $row['orders'],
                'product_revenue' => $row['revenue'],
                'cogs' => $row['cogs'],
                'gross_profit' => Money::sub($row['revenue'], $row['cogs']),
            ])
            ->values()
            ->all();
    }

    /**
     * @return list<array{product_id: int|null, product_name: string, units_sold: int, product_revenue: string, cogs: string, gross_profit: string, margin_percent: string}>
     */
    public function byProduct(CarbonImmutable $from, CarbonImmutable $to, int $limit = 50): array
    {
        $sales = $this->realizedItems($from, $to)
            ->groupBy('order_items.product_id')
            ->selectRaw('order_items.product_id as k, MAX(order_items.product_name) as name, SUM('.self::SALE_UNITS.') as units, SUM('.self::SALE_REVENUE.') as revenue, SUM('.self::SALE_COGS.') as cogs')
            ->get()->keyBy('k');
        $returns = $this->returnsInPeriod($from, $to)
            ->groupBy('order_items.product_id')
            ->selectRaw('order_items.product_id as k, MAX(order_items.product_name) as name, SUM(r.quantity) as units, SUM(r.value) as revenue, SUM(order_items.unit_cost * (r.quantity - r.damaged)) as cogs')
            ->get()->keyBy('k');

        return $this->merge($sales, $returns)
            ->map(function (array $row, $productId) {
                $gross = Money::sub($row['revenue'], $row['cogs']);

                return [
                    'product_id' => $productId === '' ? null : (int) $productId,
                    'product_name' => $row['name'],
                    'units_sold' => $row['units'],
                    'product_revenue' => $row['revenue'],
                    'cogs' => $row['cogs'],
                    'gross_profit' => $gross,
                    'margin_percent' => Money::isPositive($row['revenue']) ? Money::proportion($gross, 100, $row['revenue']) : '0.00',
                ];
            })
            ->sortByDesc(fn (array $row) => (float) $row['gross_profit'])
            ->take($limit)
            ->values()
            ->all();
    }

    /**
     * One realized summary per calendar month in the range.
     *
     * @return list<array<string, string|int>>
     */
    public function monthly(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $months = [];

        foreach (CarbonPeriod::create($from->startOfMonth(), '1 month', $to->startOfMonth()) as $month) {
            $start = CarbonImmutable::instance($month)->max($from);
            $end = CarbonImmutable::instance($month)->endOfMonth()->min($to);

            $months[] = ['month' => $month->format('Y-m')] + $this->realizedSummary($start, $end);
        }

        return $months;
    }

    /**
     * @return array<string, string|int>
     */
    private function realizedSummary(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $sale = $this->realizedItems($from, $to)
            ->selectRaw('COALESCE(SUM('.self::SALE_REVENUE.'), 0) as revenue')
            ->selectRaw('COALESCE(SUM('.self::SALE_COGS.'), 0) as cogs')
            ->first();

        $returned = $this->returnsInPeriod($from, $to)
            ->selectRaw('COALESCE(SUM(r.value), 0) as revenue')
            ->selectRaw('COALESCE(SUM(order_items.unit_cost * (r.quantity - r.damaged)), 0) as cogs')
            ->first();

        $orders = $this->realizedOrders($from, $to)
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw('COALESCE(SUM(orders.coupon_discount + orders.manual_discount), 0) as discounts')
            ->selectRaw('COALESCE(SUM(CASE WHEN orders.delivered_at IS NOT NULL THEN orders.delivery_charge ELSE 0 END), 0) as delivery_income')
            ->selectRaw('COALESCE(SUM(orders.delivery_cost), 0) as delivery_cost')
            ->first();

        $fees = DB::table('payments')
            ->joinSub($this->realizedOrders($from, $to)->select('orders.id'), 'realized', 'realized.id', '=', 'payments.order_id')
            ->where('payments.status', PaymentRecordStatus::Verified->value)
            ->sum('payments.fee');

        // refunds dated by when the money went back
        $refunds = DB::table('payments')
            ->join('orders', 'orders.id', '=', 'payments.order_id')
            ->where('orders.status', '!=', OrderStatus::Cancelled->value)
            ->where('payments.type', PaymentType::Refund->value)
            ->where('payments.status', PaymentRecordStatus::Verified->value)
            ->whereBetween('payments.paid_at', [$from->startOfDay(), $to->endOfDay()])
            ->selectRaw('COALESCE(SUM(payments.delivery_amount), 0) as delivery, COALESCE(SUM(payments.goodwill_amount), 0) as goodwill')
            ->first();

        $expenses = Money::of(DB::table('expenses')
            ->whereBetween('expense_date', [$from->toDateString(), $to->toDateString()])
            ->sum('amount'));

        $revenue = Money::sub($sale->revenue, $returned->revenue);
        $cogs = Money::sub($sale->cogs, $returned->cogs);
        $gross = Money::sub($revenue, $cogs);
        $deliveryIncome = Money::sub($orders->delivery_income, $refunds->delivery);
        $deliveryNet = Money::sub($deliveryIncome, $orders->delivery_cost);

        return [
            'orders' => (int) $orders->orders,
            'product_revenue' => $revenue,
            'returns' => Money::of($returned->revenue),
            'discounts' => Money::of($orders->discounts),
            'cogs' => $cogs,
            'gross_profit' => $gross,
            'delivery_income' => $deliveryIncome,
            'delivery_cost' => Money::of($orders->delivery_cost),
            'delivery_net' => $deliveryNet,
            'payment_fees' => Money::of($fees),
            'compensation' => Money::of($refunds->goodwill),
            'operating_expenses' => $expenses,
            'net_profit' => Money::sub(
                Money::sub(Money::sub(Money::add($gross, $deliveryNet), $fees), $refunds->goodwill),
                $expenses,
            ),
        ];
    }

    /**
     * @return array{orders: int, product_revenue: string, cogs: string, gross_profit: string}
     */
    private function estimatedSummary(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $openStatuses = array_map(fn (OrderStatus $status) => $status->value, array_filter(OrderStatus::cases(), fn (OrderStatus $status) => $status->isOpen()));

        $row = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', $openStatuses)
            ->whereBetween('orders.placed_at', [$from->startOfDay(), $to->endOfDay()])
            ->selectRaw('COUNT(DISTINCT orders.id) as orders')
            ->selectRaw('COALESCE(SUM(order_items.line_total), 0) as product_revenue')
            ->selectRaw('COALESCE(SUM(order_items.unit_cost * order_items.quantity), 0) as cogs')
            ->first();

        return [
            'orders' => (int) $row->orders,
            'product_revenue' => Money::of($row->product_revenue),
            'cogs' => Money::of($row->cogs),
            'gross_profit' => Money::sub($row->product_revenue, $row->cogs),
        ];
    }

    private function realizedOrders(CarbonImmutable $from, CarbonImmutable $to): Builder
    {
        return DB::table('orders')
            ->whereIn('orders.status', [OrderStatus::Delivered->value, OrderStatus::Returned->value])
            ->whereRaw(self::REALIZED_AT.' BETWEEN ? AND ?', [$from->startOfDay(), $to->endOfDay()]);
    }

    private function realizedItems(CarbonImmutable $from, CarbonImmutable $to): Builder
    {
        return $this->realizedOrders($from, $to)
            ->join('order_items', 'order_items.order_id', '=', 'orders.id');
    }

    /**
     * Returns of delivered orders that happened in the period (returns of orders that never
     * reached the customer are already inside that order's sale figures).
     */
    private function returnsInPeriod(CarbonImmutable $from, CarbonImmutable $to): Builder
    {
        return DB::table('order_item_returns as r')
            ->join('order_items', 'order_items.id', '=', 'r.order_item_id')
            ->join('orders', 'orders.id', '=', 'r.order_id')
            ->whereNotNull('orders.delivered_at')
            ->whereBetween('r.returned_at', [$from->startOfDay(), $to->endOfDay()]);
    }

    /**
     * Sales minus returns per key (channel / product).
     *
     * @param  Collection<string, object>  $sales
     * @param  Collection<string, object>  $returns
     * @return Collection<string, array{orders: int, name: string|null, units: int, revenue: string, cogs: string}>
     */
    private function merge(Collection $sales, Collection $returns): Collection
    {
        return $sales->keys()->merge($returns->keys())->unique()->mapWithKeys(function ($key) use ($sales, $returns) {
            $sale = $sales->get($key);
            $back = $returns->get($key);

            return [(string) $key => [
                'orders' => (int) ($sale->orders ?? 0),
                'name' => $sale->name ?? $back->name ?? null,
                'units' => (int) ($sale->units ?? 0) - (int) ($back->units ?? 0),
                'revenue' => Money::sub(Money::of($sale->revenue ?? 0), Money::of($back->revenue ?? 0)),
                'cogs' => Money::sub(Money::of($sale->cogs ?? 0), Money::of($back->cogs ?? 0)),
            ]];
        });
    }
}
