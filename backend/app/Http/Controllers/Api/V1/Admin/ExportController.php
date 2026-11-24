<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\Order;
use App\Models\Payment;
use App\Models\ProductVariant;
use App\Services\ActivityLogger;
use App\Services\OperationsService;
use App\Services\ReportService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Owner-only CSV downloads (open in Excel / Google Sheets). UTF-8 with BOM so Bangla
 * names show correctly in Excel. Cells starting with = + - @ are prefixed with ' so a
 * spreadsheet never runs them as formulas.
 */
class ExportController extends Controller
{
    public const TYPES = ['orders', 'payments', 'expenses', 'inventory', 'customers', 'products', 'restock'];

    public function __invoke(Request $request, string $type, ReportService $reports, OperationsService $operations, ActivityLogger $log): StreamedResponse
    {
        abort_unless(in_array($type, self::TYPES, true), 404);

        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'status' => ['nullable', Rule::enum(OrderStatus::class)],
        ]);
        $to = CarbonImmutable::parse($data['to'] ?? 'today')->endOfDay();
        $from = CarbonImmutable::parse($data['from'] ?? $to->subDays(29))->startOfDay();
        abort_if($from->diffInDays($to) > 1096, 422, 'Date range is too long.');

        [$header, $rows] = match ($type) {
            'orders' => $this->orders($from, $to, $data['status'] ?? null),
            'payments' => $this->payments($from, $to),
            'expenses' => $this->expenses($from, $to),
            'inventory' => $this->inventory(),
            'customers' => $this->customers(),
            'products' => [
                ['Product', 'Units sold', 'Revenue', 'Cost of goods', 'Gross profit', 'Margin %'],
                collect($reports->byProduct($from->startOfDay(), $to->startOfDay(), 1000))->map(fn (array $r) => [$r['product_name'], $r['units_sold'], $r['product_revenue'], $r['cogs'], $r['gross_profit'], $r['margin_percent']]),
            ],
            'restock' => [
                ['Product', 'Variant', 'SKU', 'Available', 'Sold (30 days)', 'Per day', 'Days left', 'Suggested quantity', 'Urgency'],
                collect($operations->reorderSuggestions())->map(fn (array $r) => [$r['product'], $r['title'], $r['sku'], $r['available'], $r['sold_last_days'], $r['per_day'], $r['days_left'] ?? '', $r['suggested_quantity'], $r['urgency']]),
            ],
        };

        $log->record('export.'.$type, 'export', null, "Downloaded {$type} CSV ({$from->toDateString()} to {$to->toDateString()})");

        $filename = "nakshazz-{$type}-".now()->format('Y-m-d').'.csv';

        return response()->streamDownload(function () use ($header, $rows) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, $header, escape: '');
            foreach ($rows as $row) {
                fputcsv($out, array_map($this->cell(...), $row), escape: '');
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function cell(mixed $value): string
    {
        $text = (string) ($value ?? '');

        return preg_match('/^[=+\-@\t\r]/', $text) && ! is_numeric($text) ? "'".$text : $text;
    }

    /**
     * @return array{0: list<string>, 1: iterable<array<int, mixed>>}
     */
    private function orders(CarbonImmutable $from, CarbonImmutable $to, ?string $status): array
    {
        $orders = Order::query()
            ->with('items:id,order_id,product_name,variant_title,quantity')
            ->whereBetween('placed_at', [$from, $to])
            ->when($status, fn ($query) => $query->where('status', $status))
            ->orderBy('placed_at')
            ->lazy(200)
            ->map(fn (Order $o) => [
                $o->order_number, $o->placed_at?->format('Y-m-d H:i'), $o->channel?->label(), $o->status->label(),
                $o->customer_name, $o->customer_phone, $o->shipping_city, $o->shipping_address,
                $o->items->map(fn ($i) => $i->product_name.($i->variant_title ? " ({$i->variant_title})" : '').' x'.$i->quantity)->implode('; '),
                $o->items_subtotal, $o->coupon_discount, $o->manual_discount, $o->delivery_charge, $o->grand_total,
                $o->payment_method?->label(), $o->payment_status?->value, $o->courier_name, $o->tracking_code,
                $o->delivered_at?->format('Y-m-d'),
            ]);

        return [['Order', 'Placed', 'Channel', 'Status', 'Customer', 'Phone', 'City', 'Address', 'Items', 'Subtotal', 'Coupon discount', 'Extra discount', 'Delivery charge', 'Total', 'Payment method', 'Payment status', 'Courier', 'Tracking', 'Delivered'], $orders];
    }

    /**
     * @return array{0: list<string>, 1: iterable<array<int, mixed>>}
     */
    private function payments(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $payments = Payment::query()
            ->with('order:id,order_number,customer_name')
            ->whereBetween('created_at', [$from, $to])
            ->orderBy('created_at')
            ->lazy(200)
            ->map(fn (Payment $p) => [
                $p->created_at?->format('Y-m-d H:i'), $p->paid_at?->format('Y-m-d H:i'), $p->order?->order_number, $p->order?->customer_name,
                $p->type->value, $p->method->label(), $p->status->value, $p->amount, $p->fee, $p->delivery_amount, $p->goodwill_amount,
                $p->refund_reason?->label(), $p->transaction_id ?? $p->rejected_transaction_id, $p->sender_number, $p->note,
            ]);

        return [['Recorded', 'Paid', 'Order', 'Customer', 'Type', 'Method', 'Status', 'Amount', 'Fee', 'Delivery part', 'Goodwill part', 'Refund reason', 'TrxID', 'Sender', 'Note'], $payments];
    }

    /**
     * @return array{0: list<string>, 1: iterable<array<int, mixed>>}
     */
    private function expenses(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $expenses = Expense::query()
            ->with(['category:id,name', 'creator:id,name'])
            ->whereBetween('expense_date', [$from->toDateString(), $to->toDateString()])
            ->orderBy('expense_date')
            ->lazy(200)
            ->map(fn (Expense $e) => [$e->expense_date?->format('Y-m-d'), $e->category?->name, $e->title, $e->amount, $e->description, $e->creator?->name]);

        return [['Date', 'Category', 'Title', 'Amount', 'Description', 'Added by'], $expenses];
    }

    /**
     * @return array{0: list<string>, 1: iterable<array<int, mixed>>}
     */
    private function inventory(): array
    {
        $variants = ProductVariant::query()
            ->with('product:id,name,status')
            ->orderBy('product_id')
            ->orderBy('sort_order')
            ->lazy(200)
            ->map(fn (ProductVariant $v) => [
                $v->product?->name, $v->title, $v->sku, $v->product?->status?->value, $v->is_active ? 'yes' : 'no',
                $v->stock_on_hand, $v->stock_reserved, $v->stock_on_hand - $v->stock_reserved,
                $v->price, $v->total_cost, bcmul((string) $v->stock_on_hand, (string) $v->total_cost, 2), bcmul((string) $v->stock_on_hand, (string) $v->price, 2),
            ]);

        return [['Product', 'Variant', 'SKU', 'Product status', 'Variant active', 'On hand', 'Reserved', 'Available', 'Price', 'Unit cost', 'Stock value at cost', 'Stock value at price'], $variants];
    }

    /**
     * @return array{0: list<string>, 1: iterable<array<int, mixed>>}
     */
    private function customers(): array
    {
        $customers = Customer::query()
            ->withCount(['orders as purchases_count' => fn ($q) => $q->whereIn('status', [OrderStatus::Shipped, OrderStatus::Delivered])])
            ->withSum(['orders as delivered_total' => fn ($q) => $q->where('status', OrderStatus::Delivered)], 'grand_total')
            ->withMax('orders as last_order_at', 'placed_at')
            ->orderBy('id')
            ->lazy(200)
            ->map(fn (Customer $c) => [$c->name, $c->phone, $c->email, $c->purchases_count, $c->delivered_total ?? '0.00', $c->last_order_at, $c->created_at?->format('Y-m-d')]);

        return [['Name', 'Phone', 'Email', 'Purchases', 'Delivered total', 'Last order', 'First seen'], $customers];
    }
}
