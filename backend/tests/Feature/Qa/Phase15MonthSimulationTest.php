<?php

namespace Tests\Feature\Qa;

use App\Enums\MovementType;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\RefundReason;
use App\Exceptions\InsufficientStockException;
use App\Models\Category;
use App\Models\ContactMessage;
use App\Models\Coupon;
use App\Models\DeliveryZone;
use App\Models\Expense;
use App\Models\Order;
use App\Models\Payment;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\InventoryService;
use App\Services\OperationsService;
use App\Services\OrderService;
use App\Services\PaymentService;
use App\Services\ProductService;
use App\Services\ReportService;
use Carbon\CarbonImmutable;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * QA audit, phase 15: a 30-day business simulation (1–30 December 2026, Asia/Dhaka).
 *
 * Everything is deterministic (no randomness): order k on day d picks its product, quantity,
 * channel, payment and fate from simple arithmetic, so every transaction can be traced.
 *
 * A shadow ledger is kept in plain PHP from the simulation's own inputs — never read back
 * from the database — and compared with the app every day and at month end:
 *  - a sale counts on its delivery day; a return, a refunded delivery charge and goodwill
 *    count on the day they happen (owner's DECISION-1 and rule Q2) — so closed days never move
 * The report is written to STDERR between QA-SIM-BEGIN / QA-SIM-END.
 */
#[Group('qa')]
class Phase15MonthSimulationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    private DeliveryZone $inside;

    private DeliveryZone $outside;

    /** @var list<array{id: int, key: string, price: string, cost: string, product: string}> */
    private array $variants = [];

    /** shadow stock: variant id => [on hand, reserved] */
    private array $stock = [];

    /** shadow ledger by day (Y-m-d) under app rules */
    private array $day = [];

    /** money actually received / paid back, by day */
    private array $cash = [];

    /** @var array<int, array<string, mixed>> shadow of each order */
    private array $orders = [];

    /** @var array<string, list<array{0: int, 1: string}>> day => scheduled actions */
    private array $schedule = [];

    private array $counts = ['attempted' => 0, 'placed' => 0, 'refused_stock' => 0, 'cancelled' => 0, 'delivered' => 0, 'returns' => 0, 'goodwill' => 0, 'messages' => 0, 'staff_refused' => 0];

    private float $deliveryRefunded = 0;

    private int $k = 0;

    #[Test]
    public function the_month_reconciles_day_by_day(): void
    {
        $this->setUpShop();

        for ($d = 1; $d <= 30; $d++) {
            $date = sprintf('2026-12-%02d', $d);
            $this->at($date, '09:00');
            $this->businessEvents($d, $date);

            $this->at($date, '10:00');
            $n = 5 + ($d * 7) % 5;                       // 5–9 orders a day
            for ($i = 0; $i < $n; $i++) {
                $this->k++;
                $this->placeOrder($d, $date);
            }

            $this->at($date, '15:00');
            foreach ($this->schedule[$date] ?? [] as [$orderId, $action]) {
                $this->runAction($orderId, $action, $date);
            }
        }

        $this->assertMonth();
    }

    // ───────────────────────── setup & business events ─────────────────────────

    private function setUpShop(): void
    {
        $this->seed(StoreSettingSeeder::class);
        $this->owner = User::factory()->owner()->create();
        $this->staff = User::factory()->create();
        $this->inside = DeliveryZone::factory()->create(['name' => 'Inside Dhaka', 'charge' => '70.00']);
        $this->outside = DeliveryZone::factory()->create(['name' => 'Outside Dhaka', 'charge' => '130.00']);

        $this->at('2026-12-01', '08:00');
        $catalog = [
            ['Red Meenakari Jhumka', [['Golden', 650, 380, 40]]],
            ['Oxidised Barrel Jhumka', [['Silver', 520, 290, 30], ['Black', 520, 290, 12]]],
            ['Aqua Agate Drops', [['Aqua', 350, 160, 40]]],
            ['Kundan Chandbali', [['Golden', 900, 520, 25], ['Rose', 950, 540, 15]]],
            ['Clay Lotus Studs', [['Pink', 280, 110, 50], ['Teal', 280, 110, 50], ['Ivory', 280, 110, 30]]],
            ['Pearl Fringe Earrings', [['White', 450, 230, 35]]],
            ['Copper Leaf Necklace', [['Copper', 1250, 700, 20]]],
            ['Resin Rose Pendant', [['Red', 480, 210, 25], ['Blue', 480, 210, 25]]],
            ['Sunset Bead Necklace', [['Orange', 780, 400, 18]]],
            ['Tiny Moon Studs', [['Silver', 220, 90, 6]]],               // sells out in week 3
            ['Peacock Statement Studs', [['Green', 560, 300, 22]]],
            ['Jade Stone Drops', [['Green', 360, 170, 30]]],
        ];
        foreach ($catalog as $i => [$name, $colours]) {
            $this->addProduct($name, $colours, "c{$i}");
        }
    }

    private function addProduct(string $name, array $colours, string $key): void
    {
        $category = Category::query()->firstOrCreate(['slug' => 'sim'], ['name' => 'Simulation', 'is_active' => true]);
        $product = app(ProductService::class)->save(null, [
            'category_id' => $category->id, 'name' => $name, 'status' => 'active',
            'variants' => array_map(fn ($c, $j) => ['sku' => strtoupper($key)."-{$j}", 'title' => $c[0], 'options' => ['Color' => $c[0]], 'price' => (string) $c[1], 'raw_material_cost' => (string) $c[2], 'initial_stock' => $c[3]], $colours, array_keys($colours)),
        ], $this->owner);

        foreach ($product->variants->sortBy('sort_order')->values() as $j => $variant) {
            $this->variants[] = ['id' => $variant->id, 'key' => "{$name} / {$colours[$j][0]}", 'price' => number_format($colours[$j][1], 2, '.', ''), 'cost' => number_format($colours[$j][2], 2, '.', ''), 'product' => $name];
            $this->stock[$variant->id] = [$colours[$j][3], 0];
        }
    }

    private function businessEvents(int $d, string $date): void
    {
        $expense = function (string $title, int $amount) use ($date): void {
            Expense::factory()->create(['title' => $title, 'amount' => (string) $amount, 'expense_date' => $date]);
            $this->ledger($date)['expenses'] += $amount;
        };

        if ($d === 1) {
            $expense('Shop rent December', 15000);
        }
        if (in_array($d, [1, 8, 15, 22, 29], true)) {
            $expense('Packaging boxes', 1200);
        }
        if (in_array($d, [8, 15, 22], true)) {
            $expense('Facebook ads', 2500);
        }
        if ($d === 30) {
            $expense('Staff salary', 12000);
        }

        if ($d === 9) {                               // week 2: three new products
            $this->addProduct('Golden Petal Bar Pendant', [['Golden', 690, 360, 20]], 'n1');
            $this->addProduct('Lavender Square Pendant', [['Lavender', 480, 220, 20]], 'n2');
            $this->addProduct('Sage Clay Fringe', [['Sage', 350, 150, 25]], 'n3');
        }
        if ($d === 10) {                              // price rise on Kundan Golden: only later orders pay it
            $variant = $this->variantByKey('Kundan Chandbali / Golden');
            ProductVariant::query()->whereKey($variant['id'])->update(['price' => '990.00']);
            $this->setPrice($variant['id'], '990.00');
        }
        if ($d === 15) {                              // week 3 promotion
            Coupon::factory()->create(['code' => 'DEC10', 'type' => 'percent', 'value' => '10', 'starts_at' => '2026-12-15 00:00:00', 'expires_at' => '2026-12-21 23:59:59']);
        }
        if ($d === 24) {                              // week 4 restock
            foreach (['Tiny Moon Studs / Silver' => 30, 'Aqua Agate Drops / Aqua' => 20] as $key => $qty) {
                $this->adjust($this->variantByKey($key)['id'], MovementType::Purchase, $qty, 'Restock from karigar');
            }
        }
        if ($d === 30) {                              // final count: one lost, one found
            $this->adjust($this->variantByKey('Pearl Fringe Earrings / White')['id'], MovementType::AdjustmentOut, 1, 'Stock count: missing');
            $this->adjust($this->variantByKey('Jade Stone Drops / Green')['id'], MovementType::AdjustmentIn, 1, 'Stock count: found');
        }
        if ($d % 2 === 0) {                           // customer questions every other day
            ContactMessage::query()->create(['name' => "Customer {$d}", 'phone' => '0171000'.str_pad((string) $d, 4, '0', STR_PAD_LEFT), 'message' => 'Is this available in another colour?', 'is_read' => $d < 28]);
            $this->counts['messages']++;
        }
    }

    // ───────────────────────── orders ─────────────────────────

    private function placeOrder(int $d, string $date): void
    {
        $k = $this->k;
        $this->counts['attempted']++;
        $channel = match (true) {
            $k % 7 === 3 => 'store', $k % 9 === 4 => 'facebook', default => 'web'
        };
        $method = match ($channel) {
            'store' => 'cash', 'facebook' => 'cod', default => $k % 6 === 1 ? 'bkash' : 'cod'
        };
        $zone = $k % 4 === 0 ? $this->outside : $this->inside;

        // Tiny Moon Studs is popular in week 3 until it sells out
        $pick = ($d >= 15 && $d <= 21 && $k % 3 === 0) ? $this->variantByKey('Tiny Moon Studs / Silver') : $this->variants[($k * 7 + $d) % count($this->variants)];
        $lines = [[$pick, 1 + ($k % 5 === 0 ? 1 : 0)]];
        $coupon = ($channel === 'web' && $d >= 15 && $d <= 21 && $k % 3 === 1) ? 'DEC10' : null;
        if ($k % 8 === 2 && $coupon === null && $channel === 'web') {
            $second = $this->variants[($k * 11 + 3) % count($this->variants)];
            if ($second['id'] !== $pick['id']) {
                $lines[] = [$second, 1];
            }
        }

        // shadow stock check: the app must refuse exactly when the shadow says there is not enough
        $enough = collect($lines)->every(fn ($l) => $this->stock[$l[0]['id']][0] - $this->stock[$l[0]['id']][1] >= $l[1]);
        $customer = ['name' => "Sim {$k}", 'phone' => '017'.str_pad((string) (10000000 + $k % 150), 8, '0', STR_PAD_LEFT)];

        try {
            if ($channel === 'store') {
                $order = app(OrderService::class)->createManualSale(['channel' => 'physical_store', 'status' => 'delivered', 'customer' => $k % 2 ? $customer : null,
                    'items' => array_map(fn ($l) => ['variant_id' => $l[0]['id'], 'quantity' => $l[1]], $lines), 'manual_discount' => $k % 14 === 3 ? '50' : null, 'payment' => ['method' => 'cash']], $this->staff);
            } elseif ($channel === 'facebook') {
                $order = app(OrderService::class)->createManualSale(['channel' => 'facebook', 'status' => 'confirmed', 'customer' => $customer,
                    'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Chattogram', 'delivery_zone_id' => $zone->id],
                    'items' => array_map(fn ($l) => ['variant_id' => $l[0]['id'], 'quantity' => $l[1]], $lines), 'payment' => ['method' => 'cod']], $this->staff);
            } else {
                $payment = ['method' => $method];
                if ($method === 'bkash') {
                    $payment += ['sender_number' => '01811111111', 'transaction_id' => 'SIM'.str_pad((string) $k, 8, '0', STR_PAD_LEFT)];
                }
                $order = app(OrderService::class)->placeWebsiteOrder(['customer' => $customer, 'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $zone->id],
                    'items' => array_map(fn ($l) => ['variant_id' => $l[0]['id'], 'quantity' => $l[1]], $lines), 'coupon_code' => $coupon, 'payment' => $payment]);
            }
        } catch (InsufficientStockException) {
            $this->assertFalse($enough, "order {$k}: app refused although shadow had stock");
            $this->counts['refused_stock']++;

            return;
        }
        $this->assertTrue($enough, "order {$k}: app accepted although shadow had no stock");
        $this->counts['placed']++;

        // shadow pricing
        $subtotal = array_sum(array_map(fn ($l) => (float) $this->priceOf($l[0]['id']) * $l[1], $lines));
        $discount = $coupon ? round($subtotal * 0.10, 2) : (($channel === 'store' && $k % 14 === 3) ? 50.0 : 0.0);
        $deliveryCharge = $channel === 'store' ? 0.0 : (float) $zone->charge;
        $grand = $subtotal - $discount + $deliveryCharge;
        $this->assertSame(number_format($grand, 2, '.', ''), $order->grand_total, "order {$k} total");

        $this->orders[$order->id] = [
            'k' => $k, 'channel' => $channel, 'method' => $method, 'lines' => $lines, 'subtotal' => $subtotal, 'discount' => $discount,
            'delivery' => $deliveryCharge, 'grand' => $grand, 'zone' => $zone->id === $this->outside->id ? 'outside' : 'inside', 'paid' => 0.0, 'refunded' => 0.0,
            'delivered_on' => null, 'cost' => array_sum(array_map(fn ($l) => (float) $l[0]['cost'] * $l[1], $lines)),
        ];

        if ($channel === 'store') {
            foreach ($lines as [$v, $q]) {
                $this->stock[$v['id']][0] -= $q;
            }
            $this->realize($order->id, $date, fee: 0, courier: 0);
            $this->received($order->id, $date, $grand);

            return;
        }
        foreach ($lines as [$v, $q]) {
            $this->stock[$v['id']][1] += $q;
        }
        if ($method === 'bkash') {
            app(PaymentService::class)->verify($order->payments()->firstOrFail(), $this->staff, '15');
            $this->received($order->id, $date, $grand);
        }

        // fate of the order
        $next = fn (int $plus) => CarbonImmutable::parse($date)->addDays($plus)->toDateString();
        $single = count($lines) === 1;
        if ($k % 20 === 0 && $single) {
            $this->schedule[$next(1)][] = [$order->id, 'cancel'];
        } elseif ($k % 25 === 7) {
            // customer never answers: stays pending
        } else {
            $this->schedule[$next(1)][] = [$order->id, 'confirm'];
            $this->schedule[$next(2)][] = [$order->id, 'ship'];
            $this->schedule[$next(3)][] = [$order->id, 'deliver'];
            if ($single && $k % 33 === 5) {
                $this->schedule[$next(5)][] = [$order->id, 'return_partial'];
            } elseif ($single && $k % 47 === 3) {
                $this->schedule[$next(5)][] = [$order->id, 'return_full_with_delivery'];
            } elseif ($single && $k % 50 === 13) {
                $this->schedule[$next(5)][] = [$order->id, 'return_damaged'];
            } elseif ($k % 40 === 11) {
                $this->schedule[$next(6)][] = [$order->id, 'goodwill'];
            }
        }
    }

    private function runAction(int $orderId, string $action, string $date): void
    {
        $order = Order::query()->findOrFail($orderId);
        $o = &$this->orders[$orderId];
        $service = app(OrderService::class);

        switch ($action) {
            case 'cancel':
                if ($o['paid'] - $o['refunded'] > 0) {
                    // owner's rule: refund first, then cancel
                    $amount = $o['paid'] - $o['refunded'];
                    app(PaymentService::class)->refund($order, (string) $amount, PaymentMethod::Bkash, RefundReason::Cancellation, $this->owner, 'Customer cancelled', transactionId: 'CXL'.str_pad((string) $orderId, 8, '0', STR_PAD_LEFT));
                    $this->paidBack($orderId, $date, $amount);
                }
                $service->transition($order, OrderStatus::Cancelled, $this->staff);
                foreach ($o['lines'] as [$v, $q]) {
                    $this->stock[$v['id']][1] -= $q;
                }
                $this->counts['cancelled']++;
                break;
            case 'confirm':
                if ($order->status !== OrderStatus::Confirmed) {
                    $service->transition($order, OrderStatus::Confirmed, $this->staff);
                }
                break;
            case 'ship':
                $courier = $o['zone'] === 'outside' ? 110 : 60;
                $service->transition($order, OrderStatus::Shipped, $this->staff, ['delivery_cost' => (string) $courier, 'courier_name' => 'Steadfast']);
                foreach ($o['lines'] as [$v, $q]) {
                    $this->stock[$v['id']][0] -= $q;
                    $this->stock[$v['id']][1] -= $q;
                }
                $o['courier'] = $courier;
                break;
            case 'deliver':
                $fee = $o['method'] === 'bkash' ? 0 : 20;   // bKash fee was booked when verified
                $service->transition($order, OrderStatus::Delivered, $this->staff, ['cod_fee' => (string) $fee]);
                $this->realize($orderId, $date, fee: $o['method'] === 'bkash' ? 15 : $fee, courier: $o['courier']);
                if ($o['method'] !== 'bkash') {
                    $this->received($orderId, $date, $o['grand'] - $o['paid']);
                }
                $this->counts['delivered']++;
                break;
            case 'return_partial':
            case 'return_damaged':
            case 'return_full_with_delivery':
                [$v, $q] = $o['lines'][0];
                $item = $order->items()->firstOrFail();
                $back = $action === 'return_partial' ? 1 : $q;
                $damaged = $action === 'return_damaged' ? 1 : 0;
                $value = round(((float) $item->line_total) * $back / $q, 2);
                $refund = $action === 'return_full_with_delivery' ? $value + $o['delivery'] : $value;
                $service->processReturn($order, [['order_item_id' => $item->id, 'quantity' => $back, 'damaged' => $damaged]], ['amount' => (string) $refund, 'method' => 'cash'], $this->owner);
                $this->stock[$v['id']][0] += $back - $damaged;
                // revenue and cost of the returned (sellable) units come off the day of the return
                $this->ledger($date)['revenue'] -= $value;
                $this->ledger($date)['cogs'] -= (float) $v['cost'] * ($back - $damaged);
                if ($action === 'return_full_with_delivery') {
                    // rule Q2: the refunded delivery charge lowers delivery income, on the refund day
                    $this->ledger($date)['delivery_income'] -= $o['delivery'];
                    $this->deliveryRefunded += $o['delivery'];
                }
                $this->paidBack($orderId, $date, $refund);
                $this->counts['returns']++;
                break;
            case 'goodwill':
                app(PaymentService::class)->refund($order, '100', PaymentMethod::Bkash, RefundReason::Compensation, $this->owner, 'Late delivery');
                $this->ledger($date)['compensation'] += 100;
                $this->paidBack($orderId, $date, 100);
                $this->counts['goodwill']++;
                // staff try the same once and are refused
                if ($this->counts['staff_refused'] === 0) {
                    $this->actingAs($this->staff)->postJson("/api/v1/admin/orders/{$orderId}/refunds", ['amount' => '1', 'method' => 'cash'])->assertForbidden();
                    $this->counts['staff_refused']++;
                }
                break;
        }
    }

    // ───────────────────────── shadow ledger ─────────────────────────

    private function realize(int $orderId, string $date, float $fee, float $courier): void
    {
        $o = &$this->orders[$orderId];
        $o['delivered_on'] = $date;
        $l = &$this->ledger($date);
        $l['orders']++;
        $l['revenue'] += $o['subtotal'] - $o['discount'];
        $l['discounts'] += $o['discount'];
        $l['cogs'] += $o['cost'];
        $l['delivery_income'] += $o['delivery'];
        $l['delivery_cost'] += $courier;
        $l['fees'] += $fee;
    }

    private function &ledger(string $date): array
    {
        $this->day[$date] ??= ['orders' => 0, 'revenue' => 0.0, 'discounts' => 0.0, 'cogs' => 0.0, 'delivery_income' => 0.0, 'delivery_cost' => 0.0, 'fees' => 0.0, 'compensation' => 0.0, 'expenses' => 0.0];

        return $this->day[$date];
    }

    private function received(int $orderId, string $date, float $amount): void
    {
        $this->orders[$orderId]['paid'] += $amount;
        $this->cash[$date]['in'] = ($this->cash[$date]['in'] ?? 0) + $amount;
    }

    private function paidBack(int $orderId, string $date, float $amount): void
    {
        $this->orders[$orderId]['refunded'] += $amount;
        $this->cash[$date]['out'] = ($this->cash[$date]['out'] ?? 0) + $amount;
    }

    private function net(array $l): float
    {
        return $l['revenue'] - $l['cogs'] + $l['delivery_income'] - $l['delivery_cost'] - $l['fees'] - $l['compensation'] - $l['expenses'];
    }

    // ───────────────────────── month-end checks & report ─────────────────────────

    private function assertMonth(): void
    {
        $reports = app(ReportService::class);
        $money = fn ($v) => number_format((float) $v, 2, '.', '');
        $rows = [];
        $total = ['orders' => 0, 'revenue' => 0.0, 'discounts' => 0.0, 'cogs' => 0.0, 'delivery_income' => 0.0, 'delivery_cost' => 0.0, 'fees' => 0.0, 'compensation' => 0.0, 'expenses' => 0.0];

        // 1. every day: app report = shadow (app rules)
        for ($d = 1; $d <= 30; $d++) {
            $date = sprintf('2026-12-%02d', $d);
            $l = $this->ledger($date);
            $app = $reports->summary(CarbonImmutable::parse($date), CarbonImmutable::parse($date))['realized'];
            $this->assertSame([$l['orders'], $money($l['revenue']), $money($l['cogs']), $money($l['delivery_income']), $money($l['delivery_cost']), $money($l['fees']), $money($l['compensation']), $money($l['expenses']), $money($this->net($l))],
                [$app['orders'], $app['product_revenue'], $app['cogs'], $app['delivery_income'], $app['delivery_cost'], $app['payment_fees'], $app['compensation'], $app['operating_expenses'], $app['net_profit']], "day {$date}");
            foreach ($total as $key => $_) {
                $total[$key] += $l[$key];
            }
            $placed = Order::query()->whereDate('placed_at', $date)->count();
            $rows[] = sprintf('| %s | %d | %d | %s | %s | %s | %s | %s | %s | %s | %s | %s |', substr($date, 5), $placed, $l['orders'], $money($l['revenue']), $money($l['cogs']),
                $money($l['delivery_income'] - $l['delivery_cost']), $money($l['fees']), $money($l['compensation']), $money($l['expenses']), $money($this->net($l)), $money($this->cash[$date]['in'] ?? 0), $money($this->cash[$date]['out'] ?? 0));
        }

        // 2. month total
        $month = $reports->summary(CarbonImmutable::parse('2026-12-01'), CarbonImmutable::parse('2026-12-30'));
        $this->assertSame($money($this->net($total)), $month['realized']['net_profit'], 'month net profit');
        $this->assertSame($money($total['revenue']), $month['realized']['product_revenue']);
        $this->assertSame($money($total['discounts']), $month['realized']['discounts']);
        $channelsSum = collect($reports->byChannel(CarbonImmutable::parse('2026-12-01'), CarbonImmutable::parse('2026-12-30')))->sum(fn ($c) => (float) $c['product_revenue']);
        $this->assertSame($money($total['revenue']), $money($channelsSum), 'channels add up');
        $productsSum = collect($reports->byProduct(CarbonImmutable::parse('2026-12-01'), CarbonImmutable::parse('2026-12-30'), 200))->sum(fn ($p) => (float) $p['product_revenue']);
        $this->assertSame($money($total['revenue']), $money($productsSum), 'products add up');

        // 3. stock: every variant matches the shadow, and its movement log adds up
        foreach ($this->stock as $id => [$onHand, $reserved]) {
            $variant = ProductVariant::query()->findOrFail($id);
            $this->assertSame([$onHand, $reserved], [$variant->stock_on_hand, $variant->stock_reserved], "stock {$variant->sku}");
            $this->assertSame($onHand, (int) DB::table('inventory_movements')->where('variant_id', $id)->sum('on_hand_delta'), "ledger {$variant->sku}");
            $this->assertGreaterThanOrEqual(0, $onHand);
        }

        // 4. money: received / refunded / still owed
        $in = array_sum(array_column($this->cash, 'in'));
        $out = array_sum(array_column($this->cash, 'out'));
        $this->assertSame($money($in), $money(Payment::query()->where('type', 'payment')->where('status', 'verified')->sum('amount')));
        $this->assertSame($money($out), $money(Payment::query()->where('type', 'refund')->where('status', 'verified')->sum('amount')));
        $owed = collect($this->orders)->filter(fn ($o, $id) => in_array(Order::query()->find($id)->status->value, ['pending', 'confirmed', 'processing', 'shipped'], true))->sum(fn ($o) => $o['grand'] - $o['paid']);
        $appOwed = Order::query()->whereIn('status', ['pending', 'confirmed', 'processing', 'shipped'])->get()->sum(fn ($o) => (float) app(PaymentService::class)->amountDue($o));
        $this->assertSame($money($owed), $money($appOwed));

        $stockValue = ProductVariant::query()->get()->sum(fn ($v) => max(0, $v->stock_on_hand) * (float) $v->total_cost);
        $this->assertSame($money($stockValue), app(OperationsService::class)->stockValue()['at_cost'], 'stock value');
        // the owner's rules are now the app's rules: one net profit
        $ownerNet = $this->net($total);
        $statusCounts = Order::query()->selectRaw('status, COUNT(*) c')->groupBy('status')->pluck('c', 'status')->all();
        ksort($statusCounts);

        fwrite(STDERR, "\nQA-SIM-BEGIN\n".implode("\n", [
            '| Day | Orders placed | Delivered (realized) | Revenue | COGS | Delivery net | Fees | Goodwill | Expenses | Net profit | Cash in | Cash out |',
            '|---|---|---|---|---|---|---|---|---|---|---|---|',
            ...$rows,
            sprintf('| **Total** | %d | %d | **%s** | %s | %s | %s | %s | %s | **%s** | %s | %s |', array_sum($statusCounts), $total['orders'], $money($total['revenue']), $money($total['cogs']), $money($total['delivery_income'] - $total['delivery_cost']), $money($total['fees']), $money($total['compensation']), $money($total['expenses']), $money($this->net($total)), $money($in), $money($out)),
            '',
            'COUNTS '.json_encode($this->counts + ['by_status' => $statusCounts, 'variants' => count($this->stock)]),
            'MONTH discounts='.$money($total['discounts']).' delivery_income='.$money($total['delivery_income']).' delivery_cost='.$money($total['delivery_cost']).' gross='.$money($total['revenue'] - $total['cogs']),
            'MONEY received='.$money($in).' refunded='.$money($out).' net_received='.$money($in - $out).' still_owed='.$money($owed).' stock_value_at_cost='.$money($stockValue),
            'OWNER_RULES delivery_refunded='.$money($this->deliveryRefunded).' app_net='.$money($this->net($total)).' owner_net='.$money($ownerNet),
        ])."\nQA-SIM-END\n");
    }

    // ───────────────────────── helpers ─────────────────────────

    private function at(string $date, string $time): void
    {
        $this->travelTo(CarbonImmutable::parse("{$date} {$time}", 'Asia/Dhaka'));
    }

    private function variantByKey(string $key): array
    {
        return collect($this->variants)->firstWhere('key', $key);
    }

    private function setPrice(int $id, string $price): void
    {
        foreach ($this->variants as &$v) {
            if ($v['id'] === $id) {
                $v['price'] = $price;
            }
        }
    }

    private function priceOf(int $id): string
    {
        return collect($this->variants)->firstWhere('id', $id)['price'];
    }

    private function adjust(int $variantId, MovementType $type, int $qty, string $reason): void
    {
        DB::transaction(fn () => app(InventoryService::class)->adjust(app(InventoryService::class)->lockVariants([$variantId])->first(), $type, $qty, $reason, $this->owner));
        $this->stock[$variantId][0] += $type === MovementType::AdjustmentOut ? -$qty : $qty;
    }
}
