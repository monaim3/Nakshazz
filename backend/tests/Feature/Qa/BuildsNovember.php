<?php

namespace Tests\Feature\Qa;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\RefundReason;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\DeliveryZone;
use App\Models\Expense;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\OrderService;
use App\Services\PaymentService;
use Carbon\CarbonImmutable;
use Database\Seeders\StoreSettingSeeder;

/**
 * The deterministic November 2026 used by the financial audit (phase 9) and the
 * reconciliation (phase 11): 13 orders O1-O13 and expenses, day by day in Asia/Dhaka.
 * Products: A 1,000 (cost 450), B 600 (cost 250), C 1,500 (cost 700); 100 each to start.
 */
trait BuildsNovember
{
    private User $owner;

    private DeliveryZone $inside;

    private DeliveryZone $outside;

    /** @var array<string, ProductVariant> */
    private array $v = [];

    /** @var array<string, Order> */
    private array $o = [];

    private int $seq = 0;

    /** Owner, two delivery zones, products A/B/C with 100 in stock each (set outside the ledger). */
    protected function setUpNovember(): void
    {
        $this->seed(StoreSettingSeeder::class);
        $this->owner = User::factory()->owner()->create();
        $this->inside = DeliveryZone::factory()->create(['name' => 'Inside Dhaka', 'charge' => '70.00']);
        $this->outside = DeliveryZone::factory()->create(['name' => 'Outside Dhaka', 'charge' => '130.00']);
        $category = Category::factory()->create();
        $make = fn (string $price, array $costs) => ProductVariant::factory()->for(Product::factory()->for($category))->withStock(100)
            ->create(['price' => $price, 'is_default' => true, 'raw_material_cost' => $costs[0], 'labour_cost' => $costs[1], 'packaging_cost' => $costs[2], 'other_cost' => $costs[3]]);
        $this->v = [
            'A' => $make('1000.00', ['300', '100', '30', '20']),
            'B' => $make('600.00', ['150', '70', '20', '10']),
            'C' => $make('1500.00', ['500', '150', '30', '20']),
        ];
    }

    // ───────────── the month ─────────────

    private function runNovember(): void
    {
        $owner = $this->owner;
        $orders = app(OrderService::class);
        $payments = app(PaymentService::class);
        Coupon::factory()->create(['code' => 'NOV10', 'type' => 'percent', 'value' => '10']);
        $expense = fn (string $date, string $amount) => Expense::factory()->create(['expense_date' => $date, 'amount' => $amount]);
        $expense('2026-10-31', '2000');

        $this->day('2026-11-02 10:00');
        $this->o['O1'] = $this->web('A', 2, 'cod', $this->inside);
        $this->day('2026-11-03 09:00');
        $expense('2026-11-03', '500');
        $this->to($this->o['O1'], ['confirmed', ['shipped', ['delivery_cost' => '60']]]);
        $this->day('2026-11-04 16:00');
        $this->to($this->o['O1'], [['delivered', ['cod_fee' => '20']]]);

        $this->day('2026-11-05 11:00');
        $this->o['O2'] = $this->web('B', 1, 'bkash', $this->outside);
        $payments->verify($this->o['O2']->payments()->firstOrFail(), $owner, '9');
        $this->to($this->o['O2'], ['confirmed', ['shipped', ['delivery_cost' => '110']]]);
        $this->day('2026-11-07 15:00');
        $this->to($this->o['O2'], ['delivered']);

        $this->day('2026-11-08 18:00');
        $this->o['O3'] = $orders->createManualSale(['channel' => 'physical_store', 'status' => 'delivered', 'items' => [['variant_id' => $this->v['C']->id, 'quantity' => 1]], 'manual_discount' => '100', 'payment' => ['method' => 'cash']], $owner);

        $this->day('2026-11-10 12:00');
        $this->o['O4'] = $this->web(null, 0, 'cod', $this->inside, [['A', 1], ['B', 2]], 'NOV10');
        $this->to($this->o['O4'], ['confirmed', ['shipped', ['delivery_cost' => '60']]]);
        $this->day('2026-11-12 13:00');
        $this->to($this->o['O4'], [['delivered', ['cod_fee' => '15']]]);
        $this->o['O5'] = $this->web('C', 1, 'cod', $this->inside);
        $this->day('2026-11-13 10:00');
        $this->to($this->o['O5'], ['cancelled']);

        $this->day('2026-11-15 10:00');
        $expense('2026-11-15', '1200');
        $this->o['O6'] = $this->web('A', 3, 'cod', $this->inside);
        $this->to($this->o['O6'], ['confirmed', ['shipped', ['delivery_cost' => '60']]]);
        $this->day('2026-11-17 17:00');
        $this->to($this->o['O6'], [['delivered', ['cod_fee' => '25']]]);
        $this->day('2026-11-20 12:00');
        $item = $this->o['O6']->items()->firstOrFail();
        $orders->processReturn($this->o['O6'], [['order_item_id' => $item->id, 'quantity' => 2, 'damaged' => 1]], ['amount' => '2000', 'method' => 'cash'], $owner);

        $this->day('2026-11-18 14:00');
        $this->o['O7'] = $orders->createManualSale([
            'channel' => 'facebook', 'status' => 'confirmed',
            'customer' => ['name' => 'FB buyer', 'phone' => '01799999999'],
            'shipping' => ['address' => 'Road 1', 'city' => 'Sylhet', 'delivery_zone_id' => $this->outside->id],
            'items' => [['variant_id' => $this->v['B']->id, 'quantity' => 2]],
            'payment' => ['method' => 'bkash', 'amount' => '300', 'transaction_id' => 'FBADV000001'],
        ], $owner);
        $this->day('2026-11-19 10:00');
        $this->to($this->o['O7'], [['shipped', ['delivery_cost' => '110']]]);
        $this->day('2026-11-21 16:00');
        $this->to($this->o['O7'], ['delivered']);
        $payments->recordPayment($this->o['O7']->refresh(), ['method' => PaymentMethod::Cash, 'amount' => '1030'], $owner);

        $this->day('2026-11-22 11:00');
        $this->o['O8'] = $this->web('C', 1, 'cod', $this->outside);
        $this->to($this->o['O8'], ['confirmed', ['shipped', ['delivery_cost' => '110']]]);
        $this->day('2026-11-24 15:00');
        $this->to($this->o['O8'], [['delivered', ['cod_fee' => '30']]]);
        $this->day('2026-11-25 10:00');
        $payments->refund($this->o['O8']->refresh(), '200', PaymentMethod::Bkash, RefundReason::Compensation, $owner, 'Late delivery');

        $this->day('2026-11-26 10:00');
        $this->o['O9'] = $this->web('A', 1, 'cod', $this->inside);
        $this->to($this->o['O9'], ['confirmed']);
        $this->day('2026-11-28 10:00');
        $this->o['O10'] = $this->web('B', 1, 'bkash', $this->inside);
        $this->day('2026-11-29 10:00');
        $this->o['O11'] = $this->web('A', 1, 'cod', $this->inside);
        $this->to($this->o['O11'], ['confirmed']);
        $this->day('2026-11-30 10:00');
        $expense('2026-11-30', '3000');
        $this->to($this->o['O11'], [['shipped', ['delivery_cost' => '60']]]);

        $this->day('2026-11-30 23:50');
        $this->o['O12'] = $this->web('B', 1, 'cod', $this->inside);
        $this->day('2026-11-30 23:55');
        $this->to($this->o['O12'], ['confirmed', 'delivered']);
        $this->day('2026-11-30 23:58');
        $this->o['O13'] = $this->web('A', 1, 'cod', $this->inside);
        $this->day('2026-12-01 00:05');
        $this->to($this->o['O13'], ['confirmed', 'delivered']);
        $expense('2026-12-01', '300');
    }

    private function day(string $when): void
    {
        $this->travelTo(CarbonImmutable::parse($when, 'Asia/Dhaka'));
    }

    /** @param list<string|array{0: string, 1: array<string, string>}> $steps */
    private function to(Order $order, array $steps): void
    {
        foreach ($steps as $step) {
            [$status, $meta] = is_array($step) ? $step : [$step, []];
            app(OrderService::class)->transition($order->refresh(), OrderStatus::from($status), $this->owner, $meta);
        }
        $order->refresh();
    }

    /** @param list<array{0: string, 1: int}>|null $lines */
    private function web(?string $key, int $qty, string $method, DeliveryZone $zone, ?array $lines = null, ?string $coupon = null): Order
    {
        $this->seq++;
        $payment = ['method' => $method];
        if ($method === 'bkash') {
            $payment += ['sender_number' => '01811111111', 'transaction_id' => 'FIN'.str_pad((string) $this->seq, 8, '0', STR_PAD_LEFT)];
        }
        $lines ??= [[$key, $qty]];

        return app(OrderService::class)->placeWebsiteOrder([
            'customer' => ['name' => "Fin {$this->seq}", 'phone' => '0175'.str_pad((string) $this->seq, 7, '0', STR_PAD_LEFT)],
            'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $zone->id],
            'items' => array_map(fn ($l) => ['variant_id' => $this->v[$l[0]]->id, 'quantity' => $l[1]], $lines),
            'coupon_code' => $coupon,
            'payment' => $payment,
        ]);
    }
}
