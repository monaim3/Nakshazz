<?php

namespace App\Services;

use App\Enums\MovementType;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentRecordStatus;
use App\Enums\PaymentType;
use App\Models\CashClosing;
use App\Models\Order;
use App\Models\Payment;
use App\Models\ProductVariant;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Day-to-day shop numbers that are not profit reports: the daily cash closing, money
 * still owed, what the stock is worth, and which items need restocking soon.
 */
class OperationsService
{
    public function __construct(private StoreSettings $settings) {}

    /**
     * Per payment method for one day: received, refunded, fees and what should be in hand,
     * plus the count the owner saved for that method (if any).
     *
     * @return array{date: string, methods: list<array<string, mixed>>, totals: array<string, string>}
     */
    public function dailyClosing(CarbonImmutable $date): array
    {
        $rows = Payment::query()
            ->where('status', PaymentRecordStatus::Verified)
            ->whereBetween('paid_at', [$date->startOfDay(), $date->endOfDay()])
            ->selectRaw('method, type, COUNT(*) as entries, SUM(amount) as amount, SUM(COALESCE(fee, 0)) as fee')
            ->groupBy('method', 'type')
            ->get();

        $closings = CashClosing::query()->with('user:id,name')->whereDate('closing_date', $date->toDateString())->get()->keyBy(fn (CashClosing $c) => $c->method->value);

        $methods = collect(PaymentMethod::cases())->map(function (PaymentMethod $method) use ($rows, $closings) {
            $mine = $rows->where('method', $method);
            $received = Money::of((string) ($mine->firstWhere('type', PaymentType::Payment)?->amount ?? '0'));
            $fee = Money::of((string) ($mine->firstWhere('type', PaymentType::Payment)?->fee ?? '0'));
            $refunded = Money::of((string) ($mine->firstWhere('type', PaymentType::Refund)?->amount ?? '0'));
            $expected = Money::sub(Money::sub($received, $fee), $refunded);
            $closing = $closings->get($method->value);

            return [
                'method' => $method->value,
                'label' => $method->label(),
                'entries' => (int) $mine->sum('entries'),
                'received' => $received,
                'fee' => $fee,
                'refunded' => $refunded,
                'expected' => $expected,
                'counted' => $closing?->counted,
                'difference' => $closing?->difference,
                'note' => $closing?->note,
                'closed_by' => $closing?->user?->name,
                'closed_at' => $closing?->updated_at?->toIso8601String(),
            ];
        })->filter(fn (array $row) => $row['entries'] > 0 || $row['counted'] !== null)->values();

        return [
            'date' => $date->toDateString(),
            'methods' => $methods->all(),
            'totals' => [
                'received' => $methods->reduce(fn (string $sum, array $row) => Money::add($sum, $row['received']), '0.00'),
                'refunded' => $methods->reduce(fn (string $sum, array $row) => Money::add($sum, $row['refunded']), '0.00'),
                'expected' => $methods->reduce(fn (string $sum, array $row) => Money::add($sum, $row['expected']), '0.00'),
            ],
        ];
    }

    /**
     * Save what was actually counted for one method on one day. The expected figure is
     * always worked out again here, never taken from the browser.
     */
    public function saveClosing(CarbonImmutable $date, PaymentMethod $method, string $counted, ?string $note, int $userId): CashClosing
    {
        $row = collect($this->dailyClosing($date)['methods'])->firstWhere('method', $method->value);
        $expected = $row['expected'] ?? '0.00';

        return CashClosing::query()->updateOrCreate(
            ['closing_date' => $date->toDateString(), 'method' => $method->value],
            ['expected' => $expected, 'counted' => Money::of($counted), 'difference' => Money::sub($counted, $expected), 'note' => $note, 'user_id' => $userId],
        );
    }

    /**
     * Orders that went out (shipped or delivered) and are not fully paid: money the courier
     * or the customer still owes the shop.
     *
     * @return array{count: int, total: string, orders: list<array<string, mixed>>}
     */
    public function receivables(int $limit = 100): array
    {
        $paid = Payment::query()
            ->selectRaw('COALESCE(SUM(amount), 0)')
            ->whereColumn('payments.order_id', 'orders.id')
            ->where('type', PaymentType::Payment)
            ->where('status', PaymentRecordStatus::Verified);

        $orders = Order::query()
            ->whereIn('status', [OrderStatus::Shipped, OrderStatus::Delivered])
            ->select(['id', 'order_number', 'customer_name', 'customer_phone', 'status', 'payment_method', 'courier_name', 'grand_total', 'shipped_at', 'delivered_at'])
            ->selectSub($paid, 'paid_amount')
            ->whereRaw('grand_total > ('.$paid->toSql().')', $paid->getBindings())
            ->orderBy('shipped_at')
            ->get();

        $rows = $orders->map(fn (Order $order) => [
            'id' => $order->id,
            'order_number' => $order->order_number,
            'customer_name' => $order->customer_name,
            'customer_phone' => $order->customer_phone,
            'status' => $order->status->value,
            'payment_method' => $order->payment_method?->value,
            'courier_name' => $order->courier_name,
            'grand_total' => $order->grand_total,
            'paid' => Money::of((string) $order->paid_amount),
            'due' => Money::sub($order->grand_total, (string) $order->paid_amount),
            'shipped_at' => $order->shipped_at?->toIso8601String(),
            'days_out' => $order->shipped_at ? (int) $order->shipped_at->diffInDays(now()) : null,
        ]);

        return [
            'count' => $rows->count(),
            'total' => $rows->reduce(fn (string $sum, array $row) => Money::add($sum, $row['due']), '0.00'),
            'orders' => $rows->take($limit)->values()->all(),
        ];
    }

    /**
     * What the stock on the shelf is worth: at cost (money tied up) and at selling price.
     *
     * @return array{units: int, at_cost: string, at_price: string, variants: int}
     */
    public function stockValue(): array
    {
        $row = ProductVariant::query()
            ->where('stock_on_hand', '>', 0)
            ->selectRaw('COUNT(*) as variants, COALESCE(SUM(stock_on_hand), 0) as units, COALESCE(SUM(stock_on_hand * total_cost), 0) as at_cost, COALESCE(SUM(stock_on_hand * price), 0) as at_price')
            ->first();

        return [
            'units' => (int) $row->units,
            'variants' => (int) $row->variants,
            'at_cost' => Money::of((string) $row->at_cost),
            'at_price' => Money::of((string) $row->at_price),
        ];
    }

    /**
     * Restock suggestions from the last 30 days of sales: how many days the stock will last
     * and how many to make/buy to cover the next `reorder_cover_days` days.
     *
     * @return list<array<string, mixed>>
     */
    public function reorderSuggestions(int $days = 30): array
    {
        $cover = max(1, (int) $this->settings->get('reorder_cover_days', 30));
        $threshold = (int) $this->settings->get('low_stock_threshold', 3);
        $since = now()->subDays($days);

        $sold = DB::table('inventory_movements')
            ->where('created_at', '>=', $since)
            ->whereIn('type', [MovementType::Sale->value, MovementType::Return->value])
            ->selectRaw('variant_id, -SUM(on_hand_delta) as units')
            ->groupBy('variant_id')
            ->pluck('units', 'variant_id');

        return ProductVariant::query()
            ->with('product:id,name,slug,status,is_made_to_order')
            ->where('is_active', true)
            ->whereHas('product', fn ($query) => $query->where('status', 'active'))
            ->get()
            ->map(function (ProductVariant $variant) use ($sold, $days, $cover, $threshold) {
                $unitsSold = max(0, (int) ($sold[$variant->id] ?? 0));
                $perDay = $unitsSold / $days;
                $available = $variant->stock_on_hand - $variant->stock_reserved;
                $limit = $variant->low_stock_threshold ?? $threshold;
                $daysLeft = $perDay > 0 ? (int) floor(max(0, $available) / $perDay) : null;
                $suggested = max(0, (int) ceil($perDay * $cover) - $available);
                $isLow = ! $variant->allow_backorder && $available <= $limit;

                if (! $isLow && ($daysLeft === null || $daysLeft > $cover)) {
                    return null;
                }

                return [
                    'variant_id' => $variant->id,
                    'sku' => $variant->sku,
                    'title' => $variant->title,
                    'product' => $variant->product?->name,
                    'product_id' => $variant->product_id,
                    'product_slug' => $variant->product?->slug,
                    'available' => $available,
                    'low_stock_threshold' => $limit,
                    'sold_last_days' => $unitsSold,
                    'per_day' => round($perDay, 2),
                    'days_left' => $daysLeft,
                    'suggested_quantity' => $suggested > 0 ? $suggested : ($isLow ? max(1, $limit + 1 - $available) : 0),
                    'is_low' => $isLow,
                    'urgency' => match (true) {
                        $available <= 0 => 'out',
                        $daysLeft !== null && $daysLeft <= 7 => 'soon',
                        $isLow => 'low',
                        default => 'plan',
                    },
                ];
            })
            ->filter()
            ->sortBy(fn (array $row) => [$row['available'] > 0 ? 1 : 0, $row['days_left'] ?? 9999])
            ->values()
            ->all();
    }
}
