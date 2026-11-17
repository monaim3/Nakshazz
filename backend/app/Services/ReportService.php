<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Enums\PaymentRecordStatus;
use App\Enums\PaymentType;
use App\Enums\RefundReason;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Carbon\CarbonPeriod;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Profit reports. Reads only order snapshots (unit_price, unit_cost), never live product data,
 * so changing a product's price or cost never changes past results.
 *
 * Realized = delivered or returned orders, dated by delivery (or return, if never delivered).
 * Estimated = open orders (pending → shipped), dated by when they were placed.
 */
class ReportService
{
    private const REALIZED_AT = 'COALESCE(orders.delivered_at, orders.returned_at)';

    /** Revenue kept after returns: line_total × (qty − returned) ÷ qty */
    private const ITEM_REVENUE = 'order_items.line_total * (order_items.quantity - order_items.returned_quantity) / order_items.quantity';

    /** Cost of goods: units kept plus damaged returns (lost stock). */
    private const ITEM_COGS = 'order_items.unit_cost * (order_items.quantity - order_items.returned_quantity + order_items.damaged_quantity)';

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
        return $this->realizedItems($from, $to)
            ->groupBy('orders.channel')
            ->orderBy('orders.channel')
            ->selectRaw('orders.channel as channel, COUNT(DISTINCT orders.id) as orders')
            ->selectRaw('ROUND(SUM('.self::ITEM_REVENUE.'), 2) as product_revenue')
            ->selectRaw('ROUND(SUM('.self::ITEM_COGS.'), 2) as cogs')
            ->get()
            ->map(fn (object $row) => [
                'channel' => $row->channel,
                'orders' => (int) $row->orders,
                'product_revenue' => Money::of($row->product_revenue),
                'cogs' => Money::of($row->cogs),
                'gross_profit' => Money::sub($row->product_revenue, $row->cogs),
            ])
            ->all();
    }

    /**
     * @return list<array{product_id: int|null, product_name: string, units_sold: int, product_revenue: string, cogs: string, gross_profit: string, margin_percent: string}>
     */
    public function byProduct(CarbonImmutable $from, CarbonImmutable $to, int $limit = 50): array
    {
        return $this->realizedItems($from, $to)
            ->groupBy('order_items.product_id')
            ->selectRaw('order_items.product_id, MAX(order_items.product_name) as product_name')
            ->selectRaw('SUM(order_items.quantity - order_items.returned_quantity) as units_sold')
            ->selectRaw('ROUND(SUM('.self::ITEM_REVENUE.'), 2) as product_revenue')
            ->selectRaw('ROUND(SUM('.self::ITEM_COGS.'), 2) as cogs')
            ->orderByRaw('SUM('.self::ITEM_REVENUE.') - SUM('.self::ITEM_COGS.') DESC')
            ->limit($limit)
            ->get()
            ->map(function (object $row) {
                $gross = Money::sub($row->product_revenue, $row->cogs);

                return [
                    'product_id' => $row->product_id === null ? null : (int) $row->product_id,
                    'product_name' => $row->product_name,
                    'units_sold' => (int) $row->units_sold,
                    'product_revenue' => Money::of($row->product_revenue),
                    'cogs' => Money::of($row->cogs),
                    'gross_profit' => $gross,
                    'margin_percent' => Money::isPositive($row->product_revenue) ? Money::proportion($gross, 100, $row->product_revenue) : '0.00',
                ];
            })
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
        $items = $this->realizedItems($from, $to)
            ->selectRaw('ROUND(COALESCE(SUM('.self::ITEM_REVENUE.'), 0), 2) as product_revenue')
            ->selectRaw('ROUND(COALESCE(SUM('.self::ITEM_COGS.'), 0), 2) as cogs')
            ->first();

        $orders = $this->realizedOrders($from, $to)
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw('COALESCE(SUM(orders.coupon_discount + orders.manual_discount), 0) as discounts')
            ->selectRaw('COALESCE(SUM(CASE WHEN orders.delivered_at IS NOT NULL THEN orders.delivery_charge ELSE 0 END), 0) as delivery_income')
            ->selectRaw('COALESCE(SUM(orders.delivery_cost), 0) as delivery_cost')
            ->first();

        $payments = DB::table('payments')
            ->joinSub($this->realizedOrders($from, $to)->select('orders.id'), 'realized', 'realized.id', '=', 'payments.order_id')
            ->where('payments.status', PaymentRecordStatus::Verified->value)
            ->selectRaw('COALESCE(SUM(payments.fee), 0) as fees')
            ->selectRaw('COALESCE(SUM(CASE WHEN payments.type = ? AND payments.refund_reason = ? THEN payments.amount ELSE 0 END), 0) as compensation', [
                PaymentType::Refund->value,
                RefundReason::Compensation->value,
            ])
            ->first();

        $expenses = Money::of(DB::table('expenses')
            ->whereBetween('expense_date', [$from->toDateString(), $to->toDateString()])
            ->sum('amount'));

        $gross = Money::sub($items->product_revenue, $items->cogs);
        $deliveryNet = Money::sub($orders->delivery_income, $orders->delivery_cost);

        return [
            'orders' => (int) $orders->orders,
            'product_revenue' => Money::of($items->product_revenue),
            'discounts' => Money::of($orders->discounts),
            'cogs' => Money::of($items->cogs),
            'gross_profit' => $gross,
            'delivery_income' => Money::of($orders->delivery_income),
            'delivery_cost' => Money::of($orders->delivery_cost),
            'delivery_net' => $deliveryNet,
            'payment_fees' => Money::of($payments->fees),
            'compensation' => Money::of($payments->compensation),
            'operating_expenses' => $expenses,
            'net_profit' => Money::sub(
                Money::sub(Money::sub(Money::add($gross, $deliveryNet), $payments->fees), $payments->compensation),
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
}
