<?php

namespace Tests\Feature;

use App\Enums\MovementType;
use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\InvalidOrderStateException;
use App\Models\Coupon;
use App\Models\DeliveryZone;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\OrderService;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class OrderLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private OrderService $orders;

    private DeliveryZone $zone;

    protected function setUp(): void
    {
        parent::setUp();

        $this->orders = app(OrderService::class);
        $this->zone = DeliveryZone::factory()->create(['charge' => '70.00']);
    }

    #[Test]
    public function website_order_reserves_stock_and_snapshots_price_and_cost(): void
    {
        $variant = $this->variant(stock: 5, price: '1200.00');

        $order = $this->placeOrder($variant, quantity: 2);

        $this->assertSame(OrderStatus::Pending, $order->status);
        $this->assertSame('2400.00', $order->items_subtotal);
        $this->assertSame('2470.00', $order->grand_total);
        $this->assertSame('900.00', $order->cogs_total);
        $this->assertSame('NK'.(100000 + $order->id), $order->order_number);

        $variant->refresh();
        $this->assertSame(5, $variant->stock_on_hand);
        $this->assertSame(2, $variant->stock_reserved);
        $this->assertDatabaseHas('inventory_movements', ['variant_id' => $variant->id, 'type' => MovementType::Reserve->value, 'reserved_delta' => 2]);
        $this->assertDatabaseHas('customers', ['phone' => '01712345678']);
    }

    #[Test]
    public function client_cannot_buy_more_than_available_stock(): void
    {
        $variant = $this->variant(stock: 3, reserved: 2);

        $this->expectException(InsufficientStockException::class);

        $this->placeOrder($variant, quantity: 2);
    }

    #[Test]
    public function made_to_order_variant_can_be_ordered_without_stock(): void
    {
        $variant = $this->variant(stock: 0, backorder: true);

        $order = $this->placeOrder($variant, quantity: 2);

        $this->assertSame(2, $variant->refresh()->stock_reserved);
        $this->assertSame(OrderStatus::Pending, $order->status);
    }

    #[Test]
    public function cancelling_releases_reserved_stock_and_coupon_use(): void
    {
        $variant = $this->variant(stock: 5);
        $coupon = Coupon::factory()->create(['code' => 'EID100', 'value' => '100.00']);

        $order = $this->placeOrder($variant, quantity: 1, coupon: 'eid100');
        $this->assertSame(1, $coupon->refresh()->used_count);

        $this->orders->transition($order, OrderStatus::Cancelled);

        $this->assertSame(0, $variant->refresh()->stock_reserved);
        $this->assertSame(5, $variant->stock_on_hand);
        $this->assertSame(0, $coupon->refresh()->used_count);
        $this->assertDatabaseMissing('coupon_usages', ['order_id' => $order->id]);
    }

    #[Test]
    public function shipping_takes_stock_out_and_delivery_collects_cod(): void
    {
        $variant = $this->variant(stock: 5);
        $order = $this->placeOrder($variant, quantity: 2);

        $this->orders->transition($order, OrderStatus::Confirmed);
        $this->orders->transition($order, OrderStatus::Shipped, meta: ['courier_name' => 'Steadfast', 'delivery_cost' => '60']);

        $variant->refresh();
        $this->assertSame(3, $variant->stock_on_hand);
        $this->assertSame(0, $variant->stock_reserved);

        $order = $this->orders->transition($order, OrderStatus::Delivered, meta: ['cod_fee' => '20.70']);

        $this->assertSame(PaymentStatus::Paid, $order->payment_status);
        $this->assertNotNull($order->delivered_at);
        $this->assertSame('60.00', $order->delivery_cost);
        $this->assertDatabaseHas('payments', ['order_id' => $order->id, 'method' => 'cod', 'amount' => '2070.00', 'fee' => '20.70']);
    }

    #[Test]
    public function refused_parcel_returns_stock(): void
    {
        $variant = $this->variant(stock: 5);
        $order = $this->placeOrder($variant, quantity: 2);
        $this->orders->transition($order, OrderStatus::Confirmed);
        $this->orders->transition($order, OrderStatus::Shipped);

        $order = $this->orders->transition($order, OrderStatus::Returned, meta: ['delivery_cost' => '120']);

        $this->assertSame(5, $variant->refresh()->stock_on_hand);
        $this->assertSame(2, $order->items->first()->returned_quantity);
        $this->assertNotNull($order->returned_at);
    }

    #[Test]
    public function partial_return_with_damaged_unit(): void
    {
        $owner = User::factory()->owner()->create();
        $variant = $this->variant(stock: 5);
        $order = $this->placeOrder($variant, quantity: 3);
        $this->orders->transition($order, OrderStatus::Confirmed);
        $this->orders->transition($order, OrderStatus::Delivered);

        $item = $order->items()->first();
        $order = $this->orders->processReturn($order, [['order_item_id' => $item->id, 'quantity' => 2, 'damaged' => 1]], ['amount' => '2000.00', 'method' => 'bkash'], $owner);

        $this->assertSame(OrderStatus::Delivered, $order->status, 'Partial return keeps the order delivered.');
        $this->assertSame(3, $variant->refresh()->stock_on_hand, '5 − 3 sold + 1 sellable return');
        $this->assertSame(PaymentStatus::PartiallyRefunded, $order->payment_status);
        $this->assertDatabaseHas('inventory_movements', ['variant_id' => $variant->id, 'type' => MovementType::ReturnDamaged->value]);
    }

    #[Test]
    public function invalid_status_change_is_rejected(): void
    {
        $order = $this->placeOrder($this->variant(stock: 5), quantity: 1);
        $this->orders->transition($order, OrderStatus::Cancelled);

        $this->expectException(InvalidOrderStateException::class);

        $this->orders->transition($order, OrderStatus::Confirmed);
    }

    #[Test]
    public function bkash_order_waits_for_verification_and_trxid_cannot_be_reused(): void
    {
        $variant = $this->variant(stock: 5);

        $order = $this->placeOrder($variant, quantity: 1, payment: ['method' => 'bkash', 'sender_number' => '01811111111', 'transaction_id' => 'abc 123xyz']);

        $this->assertSame(PaymentStatus::PendingVerification, $order->payment_status);
        $this->assertDatabaseHas('payments', ['order_id' => $order->id, 'transaction_id' => 'ABC123XYZ', 'status' => 'pending']);

        try {
            $this->placeOrder($variant, quantity: 1, payment: ['method' => 'bkash', 'sender_number' => '01811111111', 'transaction_id' => 'ABC123XYZ']);
            $this->fail('Reused TrxID was accepted.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('payment.transaction_id', $exception->errors());
        }

        $this->assertSame(1, $variant->refresh()->stock_reserved, 'Failed checkout must roll back its reservation.');
        $this->assertSame(1, Order::query()->count());
    }

    #[Test]
    public function manual_facebook_sale_takes_stock_immediately_and_records_payment(): void
    {
        $staff = User::factory()->create();
        $variant = $this->variant(stock: 4, price: '1500.00');

        $order = $this->orders->createManualSale([
            'channel' => 'facebook',
            'status' => 'delivered',
            'customer' => ['name' => 'Rina', 'phone' => '+880 1911-111111'],
            'items' => [['variant_id' => $variant->id, 'quantity' => 2, 'unit_price' => '1400.00']],
            'manual_discount' => '100.00',
            'payment' => ['method' => 'cash'],
        ], $staff);

        $this->assertSame('2700.00', $order->grand_total);
        $this->assertSame(PaymentStatus::Paid, $order->payment_status);
        $this->assertSame('01911111111', $order->customer_phone);
        $this->assertSame($staff->id, $order->created_by);

        $variant->refresh();
        $this->assertSame(2, $variant->stock_on_hand);
        $this->assertSame(0, $variant->stock_reserved);
    }

    #[Test]
    public function order_discount_is_split_across_items_exactly(): void
    {
        $first = $this->variant(stock: 5, price: '1000.00');
        $second = $this->variant(stock: 5, price: '500.00');
        Coupon::factory()->create(['code' => 'TEN', 'value' => '100.00']);

        $order = $this->orders->placeWebsiteOrder($this->checkoutData([
            ['variant_id' => $first->id, 'quantity' => 1],
            ['variant_id' => $second->id, 'quantity' => 1],
        ], coupon: 'TEN'));

        $allocated = $order->items()->orderBy('id')->pluck('discount_allocated')->all();

        $this->assertSame(['66.67', '33.33'], $allocated);
        $this->assertSame('1400.00', Money::of($order->items()->sum('line_total')));
    }

    private function variant(int $stock, int $reserved = 0, string $price = '1000.00', bool $backorder = false): ProductVariant
    {
        return ProductVariant::factory()
            ->for(Product::factory())
            ->state(['price' => $price, 'allow_backorder' => $backorder])
            ->withStock($stock, $reserved)
            ->create()
            ->refresh();
    }

    /**
     * @param  array{method: string, sender_number?: string, transaction_id?: string}  $payment
     */
    private function placeOrder(ProductVariant $variant, int $quantity, ?string $coupon = null, array $payment = ['method' => 'cod']): Order
    {
        return $this->orders->placeWebsiteOrder(
            $this->checkoutData([['variant_id' => $variant->id, 'quantity' => $quantity]], $coupon, $payment),
            '127.0.0.1',
        );
    }

    /**
     * @param  list<array{variant_id: int, quantity: int}>  $items
     * @param  array{method: string, sender_number?: string, transaction_id?: string}  $payment
     * @return array<string, mixed>
     */
    private function checkoutData(array $items, ?string $coupon = null, array $payment = ['method' => 'cod']): array
    {
        return [
            'customer' => ['name' => 'Ayesha', 'phone' => '01712345678'],
            'shipping' => ['address' => 'House 12, Road 5', 'area' => 'Dhanmondi', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => $items,
            'coupon_code' => $coupon,
            'payment' => $payment,
        ];
    }
}
