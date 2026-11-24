<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderSource;
use App\Enums\OrderStatus;
use App\Enums\PaymentRecordStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\OrderResource;
use App\Http\Resources\Admin\VariantResource;
use App\Models\Order;
use App\Models\Payment;
use App\Models\ProductVariant;
use App\Services\OperationsService;
use App\Services\ReportService;
use App\Services\StoreSettings;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Carbon\CarbonPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __invoke(Request $request, ReportService $reports, StoreSettings $settings, OperationsService $operations): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $to = CarbonImmutable::parse($validated['to'] ?? 'today');
        $from = CarbonImmutable::parse($validated['from'] ?? $to->subDays(29));
        $canSeeFinancials = $request->user()->can('view-financials');

        $summary = $reports->summary($from, $to);
        // same formula as the Reports page, so returns lower these cards too
        $channels = collect($reports->byChannel($from, $to));
        $bySource = [
            OrderSource::Website->value => Money::of($channels->where('channel', 'website')->sum(fn ($c) => (float) $c['product_revenue'])),
            OrderSource::Manual->value => Money::of($channels->where('channel', '!=', 'website')->sum(fn ($c) => (float) $c['product_revenue'])),
        ];
        $lowStockThreshold = (int) $settings->get('low_stock_threshold', 3);
        $restock = collect($operations->reorderSuggestions());

        return response()->json(['data' => [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'cards' => [
                'total_revenue' => $summary['realized']['product_revenue'],
                'total_orders' => $summary['realized']['orders'] + $summary['estimated']['orders'],
                'completed_orders' => $summary['realized']['orders'],
                'website_sales' => $bySource[OrderSource::Website->value] ?? '0.00',
                'manual_sales' => $bySource[OrderSource::Manual->value] ?? '0.00',
                ...($canSeeFinancials ? [
                    'gross_profit' => $summary['realized']['gross_profit'],
                    'net_profit' => $summary['realized']['net_profit'],
                    'estimated_gross_profit' => $summary['estimated']['gross_profit'],
                ] : []),
            ],
            'attention' => [
                'pending_orders' => Order::query()->where('status', OrderStatus::Pending)->count(),
                'unconfirmed_over_24h' => Order::query()->where('status', OrderStatus::Pending)->where('placed_at', '<', now()->subDay())->count(),
                'bkash_to_verify' => Payment::query()->where('status', PaymentRecordStatus::Pending)->count(),
                'bkash_waiting_over_week' => Payment::query()->where('status', PaymentRecordStatus::Pending)->where('created_at', '<', now()->subDays(7))->count(),
                'ready_to_ship' => Order::query()->whereIn('status', [OrderStatus::Confirmed, OrderStatus::Processing])->count(),
                'restock_needed' => $restock->count(),
                'restock_out' => $restock->where('urgency', 'out')->count(),
            ],
            // owner: money tied up in stock and money still to come in from shipped orders
            ...($canSeeFinancials ? [
                'stock_value' => $operations->stockValue(),
                'receivables' => Arr::except($operations->receivables(0), ['orders']),
            ] : []),
            'low_stock' => VariantResource::collection(
                ProductVariant::query()
                    ->with('product:id,name,slug,status')
                    ->where('is_active', true)
                    ->where('allow_backorder', false)
                    ->whereRaw('stock_on_hand - stock_reserved <= COALESCE(low_stock_threshold, ?)', [$lowStockThreshold])
                    ->orderByRaw('stock_on_hand - stock_reserved')
                    ->limit(10)
                    ->get()
            ),
            'recent_orders' => OrderResource::collection(
                Order::query()->latest('placed_at')->latest('id')->limit(10)->get()
            ),
            'sales_chart' => $this->dailySales($from, $to),
        ]]);
    }

    /**
     * Revenue of orders placed each day (excluding cancelled) for the chart.
     *
     * @return list<array{date: string, orders: int, revenue: string}>
     */
    private function dailySales(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $rows = DB::table('orders')
            ->where('status', '!=', OrderStatus::Cancelled->value)
            ->whereBetween('placed_at', [$from->startOfDay(), $to->endOfDay()])
            ->groupByRaw('DATE(placed_at)')
            ->selectRaw('DATE(placed_at) as day, COUNT(*) as orders, SUM(items_subtotal - coupon_discount - manual_discount) as revenue')
            ->get()
            ->keyBy('day');

        $days = [];
        foreach (CarbonPeriod::create($from, $to) as $day) {
            $row = $rows->get($day->toDateString());
            $days[] = [
                'date' => $day->toDateString(),
                'orders' => (int) ($row->orders ?? 0),
                'revenue' => Money::of($row->revenue ?? 0),
            ];
        }

        return $days;
    }
}
