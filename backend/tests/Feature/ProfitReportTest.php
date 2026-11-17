<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\DeliveryZone;
use App\Models\Expense;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\OrderService;
use App\Services\ReportService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ProfitReportTest extends TestCase
{
    use RefreshDatabase;

    private OrderService $orders;

    private ReportService $reports;

    private CarbonImmutable $today;

    protected function setUp(): void
    {
        parent::setUp();

        $this->orders = app(OrderService::class);
        $this->reports = app(ReportService::class);
        $this->today = CarbonImmutable::today();
    }

    #[Test]
    public function realized_net_profit_counts_delivery_fees_and_expenses_once(): void
    {
        // Price 1000, cost 450 (300 + 100 + 30 + 20 from the factory).
        $variant = $this->variant();
        $zone = DeliveryZone::factory()->create(['charge' => '70.00']);

        $order = $this->orders->placeWebsiteOrder([
            'customer' => ['name' => 'Ayesha', 'phone' => '01712345678'],
            'shipping' => ['address' => 'Road 5', 'city' => 'Dhaka', 'delivery_zone_id' => $zone->id],
            'items' => [['variant_id' => $variant->id, 'quantity' => 2]],
            'payment' => ['method' => 'cod'],
        ]);
        $this->orders->transition($order, OrderStatus::Confirmed);
        $this->orders->transition($order, OrderStatus::Shipped, meta: ['delivery_cost' => '60.00']);
        $this->orders->transition($order, OrderStatus::Delivered, meta: ['cod_fee' => '20.00']);

        Expense::factory()->create(['amount' => '300.00', 'expense_date' => $this->today]);

        $realized = $this->reports->summary($this->today, $this->today)['realized'];

        $this->assertSame('2000.00', $realized['product_revenue']);
        $this->assertSame('900.00', $realized['cogs']);
        $this->assertSame('1100.00', $realized['gross_profit']);
        $this->assertSame('10.00', $realized['delivery_net'], '70 charged − 60 courier');
        $this->assertSame('20.00', $realized['payment_fees']);
        $this->assertSame('300.00', $realized['operating_expenses']);
        $this->assertSame('790.00', $realized['net_profit'], '1100 + 10 − 20 − 300');
    }

    #[Test]
    public function pending_orders_are_estimated_not_realized(): void
    {
        $variant = $this->variant();
        $zone = DeliveryZone::factory()->create();

        $this->orders->placeWebsiteOrder([
            'customer' => ['name' => 'Ayesha', 'phone' => '01712345678'],
            'shipping' => ['address' => 'Road 5', 'city' => 'Dhaka', 'delivery_zone_id' => $zone->id],
            'items' => [['variant_id' => $variant->id, 'quantity' => 1]],
            'payment' => ['method' => 'cod'],
        ]);

        $summary = $this->reports->summary($this->today, $this->today);

        $this->assertSame(0, $summary['realized']['orders']);
        $this->assertSame(1, $summary['estimated']['orders']);
        $this->assertSame('550.00', $summary['estimated']['gross_profit']);
    }

    #[Test]
    public function changing_product_cost_later_does_not_change_past_profit(): void
    {
        $variant = $this->variant();
        $this->manualSale($variant, quantity: 1);

        $before = $this->reports->summary($this->today, $this->today)['realized'];

        $variant->update(['raw_material_cost' => '900.00', 'price' => '5000.00']);

        $after = $this->reports->summary($this->today, $this->today)['realized'];

        $this->assertSame($before['gross_profit'], $after['gross_profit']);
        $this->assertSame('550.00', $after['gross_profit']);
    }

    #[Test]
    public function damaged_return_reduces_revenue_but_keeps_its_cost_as_loss(): void
    {
        $owner = User::factory()->owner()->create();
        $variant = $this->variant();
        $order = $this->manualSale($variant, quantity: 2);
        $item = $order->items()->first();

        // One unit back damaged; refund for a return must not be subtracted again.
        $this->orders->processReturn($order, [['order_item_id' => $item->id, 'quantity' => 1, 'damaged' => 1]], ['amount' => '1000.00', 'method' => 'cash'], $owner);

        $realized = $this->reports->summary($this->today, $this->today)['realized'];

        $this->assertSame('1000.00', $realized['product_revenue']);
        $this->assertSame('900.00', $realized['cogs'], 'Kept unit + damaged unit');
        $this->assertSame('100.00', $realized['net_profit']);
    }

    #[Test]
    public function sales_are_grouped_by_channel(): void
    {
        $variant = $this->variant();
        $this->manualSale($variant, quantity: 1, channel: 'facebook');
        $this->manualSale($variant, quantity: 2, channel: 'whatsapp');

        $channels = collect($this->reports->byChannel($this->today, $this->today))->keyBy('channel');

        $this->assertSame('1000.00', $channels['facebook']['product_revenue']);
        $this->assertSame('2000.00', $channels['whatsapp']['product_revenue']);
        $this->assertSame('1100.00', $channels['whatsapp']['gross_profit']);
    }

    private function variant(): ProductVariant
    {
        return ProductVariant::factory()->for(Product::factory())->withStock(20)->create()->refresh();
    }

    private function manualSale(ProductVariant $variant, int $quantity, string $channel = 'physical_store'): Order
    {
        return $this->orders->createManualSale([
            'channel' => $channel,
            'status' => 'delivered',
            'items' => [['variant_id' => $variant->id, 'quantity' => $quantity]],
            'payment' => ['method' => 'cash'],
        ], User::factory()->create());
    }
}
