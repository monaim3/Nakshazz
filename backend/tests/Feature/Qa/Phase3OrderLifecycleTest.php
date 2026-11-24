<?php

namespace Tests\Feature\Qa;

use App\Models\Category;
use App\Models\Coupon;
use App\Models\Customer;
use App\Models\DeliveryZone;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\OrderService;
use App\Services\StoreSettings;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * QA audit, phase 3: order lifecycle (creation, every status change, management, customer views).
 * Run with: php artisan test --group=qa
 */
#[Group('qa')]
class Phase3OrderLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];

    /** Allowed moves, as the business rules in OrderStatus define them. */
    private const ALLOWED = [
        'pending' => ['confirmed', 'cancelled'],
        'confirmed' => ['processing', 'shipped', 'delivered', 'cancelled'],
        'processing' => ['shipped', 'delivered', 'cancelled'],
        'shipped' => ['delivered', 'returned'],
        'delivered' => ['returned'],
        'cancelled' => [],
        'returned' => [],
    ];

    /** Path from a new order to each starting status. */
    private const PATH = [
        'pending' => [],
        'confirmed' => ['confirmed'],
        'processing' => ['confirmed', 'processing'],
        'shipped' => ['confirmed', 'shipped'],
        'delivered' => ['confirmed', 'delivered'],
        'cancelled' => ['cancelled'],
        'returned' => ['confirmed', 'shipped', 'returned'],
    ];

    private User $owner;

    private User $staff;

    private DeliveryZone $zone;

    private Category $category;

    private int $phoneSeq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(StoreSettingSeeder::class);
        $this->owner = User::factory()->owner()->create();
        $this->staff = User::factory()->create();
        $this->zone = DeliveryZone::factory()->create(['name' => 'Inside Dhaka', 'charge' => '70.00']);
        $this->category = Category::factory()->create();
    }

    // ───────────────────────── status changes ─────────────────────────

    #[Test]
    public function l1_every_status_change_is_allowed_or_refused_exactly_as_the_rules_say(): void
    {
        $outcomes = [];

        foreach (self::STATUSES as $from) {
            foreach (self::STATUSES as $to) {
                $variant = $this->variant(stock: 10);
                $order = $this->webOrder($variant, 2);
                $this->move($order, ...self::PATH[$from]);
                $this->assertSame($from, $order->refresh()->status->value);

                $response = $this->actingAs($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => $to]);
                $allowed = in_array($to, self::ALLOWED[$from], true);
                $outcomes["{$from}→{$to}"] = $response->status();

                $this->assertSame($allowed ? 200 : 409, $response->status(), "{$from} → {$to}");
                $this->assertSame($allowed ? $to : $from, $order->refresh()->status->value, "status after {$from} → {$to}");

                $variant->refresh();
                $this->assertSame($this->expectedStock($allowed ? $to : $from), [$variant->stock_on_hand, $variant->stock_reserved], "stock after {$from} → {$to}");
                $this->assertLedger($variant, 10);
            }
        }

        $this->assertCount(49, $outcomes);
        $this->assertSame(12, count(array_filter($outcomes, fn ($code) => $code === 200)), '2 + 4 + 3 + 2 + 1 allowed moves');
    }

    #[Test]
    public function l2_history_timestamps_user_and_note_are_kept(): void
    {
        $order = $this->webOrder($this->variant(stock: 5), 1);
        $this->actingAs($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => 'confirmed', 'note' => 'Called customer, confirmed'])->assertOk();
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/status", [
            'status' => 'shipped', 'courier_name' => 'Steadfast', 'tracking_code' => 'SF123', 'delivery_cost' => '60',
        ])->assertOk();

        $order->refresh();
        $this->assertNotNull($order->confirmed_at);
        $this->assertNotNull($order->shipped_at);
        $this->assertNull($order->delivered_at);
        $this->assertSame(['Steadfast', 'SF123', '60.00'], [$order->courier_name, $order->tracking_code, $order->delivery_cost]);

        $history = $this->actingAs($this->owner)->getJson("/api/v1/admin/orders/{$order->id}")->assertOk()->json('data.status_history');
        $this->assertSame([null, 'pending', 'confirmed'], array_column($history, 'from'));
        $this->assertSame('Called customer, confirmed', $history[1]['note']);
        $this->assertSame($this->staff->id, $history[1]['user']['id']);
        $this->assertSame($this->owner->id, $history[2]['user']['id']);
    }

    #[Test]
    public function l3_unknown_status_and_unknown_order_are_rejected(): void
    {
        $order = $this->webOrder($this->variant(stock: 5), 1);
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => 'completed'])->assertJsonValidationErrors('status');
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => 'refunded'])->assertJsonValidationErrors('status');
        $this->actingAs($this->owner)->postJson('/api/v1/admin/orders/999999/status', ['status' => 'confirmed'])->assertNotFound();
    }

    // ───────────────────────── creation ─────────────────────────

    #[Test]
    public function l4_multi_item_checkout_with_coupon_and_delivery_adds_up_to_the_taka(): void
    {
        $earring = $this->variant(price: '650.00', stock: 10);
        $necklace = $this->variant(price: '1250.00', stock: 10);
        Coupon::factory()->create(['code' => 'EID10', 'type' => 'percent', 'value' => '10', 'is_active' => true]);

        $payload = $this->payload([[$earring, 3], [$necklace, 1]]);
        $payload['coupon_code'] = 'eid10';
        $payload['items'][0]['unit_price'] = '1'; // tampered price from the browser

        $data = $this->postJson('/api/v1/checkout', $payload)->assertCreated()->json('data');

        // 3 × 650 + 1 × 1250 = 3200; 10% = 320; + 70 delivery = 2950
        $this->assertSame(['3200.00', '320.00', '70.00', '2950.00'], [$data['totals']['items_subtotal'], $data['totals']['discount'], $data['totals']['delivery_charge'], $data['totals']['grand_total']]);

        $order = Order::query()->where('uuid', $data['uuid'])->firstOrFail();
        $this->assertSame('EID10', $order->coupon_code);
        $this->assertSame('320.00', bcadd((string) $order->items->sum(fn ($i) => (float) $i->discount_allocated), '0', 2), 'discount spread across lines adds up');
        $this->assertSame('2880.00', number_format($order->items->sum(fn ($i) => (float) $i->line_total), 2, '.', ''), 'line totals = subtotal − discount');
        $this->assertSame([7, 9], [$earring->refresh()->availableStock(), $necklace->refresh()->availableStock()]);
        $this->assertSame(1, Coupon::query()->where('code', 'EID10')->value('used_count'));

        $customer = Customer::query()->where('phone', $order->customer_phone)->firstOrFail();
        $this->assertSame(1, $customer->addresses()->count());
    }

    #[Test]
    public function l5_same_variant_twice_in_the_bag_becomes_one_line(): void
    {
        $variant = $this->variant(price: '500.00', stock: 10);
        $data = $this->postJson('/api/v1/checkout', $this->payload([[$variant, 2], [$variant, 3]]))->assertCreated()->json('data');

        $this->assertCount(1, $data['items']);
        $this->assertSame(5, $data['items'][0]['quantity']);
        $this->assertSame(5, $variant->refresh()->stock_reserved);
    }

    #[Test]
    public function l6_bkash_checkout_creates_one_pending_payment_for_the_full_total(): void
    {
        $variant = $this->variant(price: '1000.00', stock: 5);
        $payload = $this->payload([[$variant, 1]], 'bkash');

        $data = $this->postJson('/api/v1/checkout', $payload)->assertCreated()->json('data');
        $order = Order::query()->where('uuid', $data['uuid'])->with('payments')->firstOrFail();

        $this->assertSame('pending_verification', $order->payment_status->value);
        $this->assertCount(1, $order->payments);
        $this->assertSame(['1070.00', 'pending', 'TRX8A1B2C3D', '01811111111'], [$order->payments[0]->amount, $order->payments[0]->status->value, $order->payments[0]->transaction_id, $order->payments[0]->sender_number]);
    }

    #[Test]
    public function l7_bkash_checkout_validation_and_reused_trxid_leave_no_order_behind(): void
    {
        $variant = $this->variant(stock: 5);

        $this->postJson('/api/v1/checkout', array_replace_recursive($this->payload([[$variant, 1]], 'bkash'), ['payment' => ['transaction_id' => null]]))->assertJsonValidationErrors('payment.transaction_id');
        $this->postJson('/api/v1/checkout', array_replace_recursive($this->payload([[$variant, 1]], 'bkash'), ['payment' => ['transaction_id' => 'abc']]))->assertJsonValidationErrors('payment.transaction_id');
        $this->postJson('/api/v1/checkout', array_replace_recursive($this->payload([[$variant, 1]], 'bkash'), ['payment' => ['sender_number' => '123']]))->assertJsonValidationErrors('payment.sender_number');

        $paid = $this->payload([[$variant, 1]], 'bkash');
        $this->postJson('/api/v1/checkout', $paid)->assertCreated();
        // same TrxID, written in lower case, by another customer
        $reuse = array_replace_recursive($this->payload([[$variant, 1]], 'bkash'), ['payment' => ['transaction_id' => strtolower($paid['payment']['transaction_id'])]]);
        $this->postJson('/api/v1/checkout', $reuse)->assertJsonValidationErrors('payment.transaction_id');

        $this->assertSame(1, Order::query()->count(), 'the rejected checkout left no order');
        $this->assertSame(1, $variant->refresh()->stock_reserved, 'and reserved nothing');
    }

    #[Test]
    public function l8_switched_off_payment_method_and_bad_delivery_zone_are_refused(): void
    {
        $variant = $this->variant(stock: 5);
        app(StoreSettings::class)->update(['cod_enabled' => false]);

        $this->postJson('/api/v1/checkout', $this->payload([[$variant, 1]]))->assertJsonValidationErrors('payment.method');

        app(StoreSettings::class)->update(['cod_enabled' => true]);
        $this->zone->update(['is_active' => false]);
        $this->postJson('/api/v1/checkout', $this->payload([[$variant, 1]]))->assertJsonValidationErrors('shipping.delivery_zone_id');
        $this->assertSame(0, Order::query()->count());
    }

    #[Test]
    public function l9_cart_check_reports_the_current_price_and_problems_before_paying(): void
    {
        $cheap = $this->variant(price: '500.00', stock: 2);
        $cheap->update(['price' => '550.00']); // price raised after the customer filled the bag

        $quote = $this->postJson('/api/v1/cart/validate', ['items' => [['variant_id' => $cheap->id, 'quantity' => 5]], 'delivery_zone_id' => $this->zone->id])->assertOk()->json('data');

        $this->assertSame('550.00', $quote['lines'][0]['unit_price']);
        $this->assertSame(2, $quote['lines'][0]['quantity'], 'capped at stock');
        $this->assertTrue($quote['has_problems']);
    }

    // ───────────────────────── payments around delivery ─────────────────────────

    #[Test]
    public function l10_cod_delivery_records_the_cash_once_with_the_courier_fee(): void
    {
        $order = $this->webOrder($this->variant(price: '1000.00', stock: 5), 1);
        $this->move($order, 'confirmed', 'shipped');
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => 'delivered', 'cod_fee' => '11'])->assertOk();
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => 'delivered'])->assertStatus(409);

        $order->refresh()->load('payments');
        $this->assertSame('paid', $order->payment_status->value);
        $this->assertCount(1, $order->payments);
        $this->assertSame(['1070.00', '11.00', 'verified'], [$order->payments[0]->amount, $order->payments[0]->fee, $order->payments[0]->status->value]);
    }

    #[Test]
    public function l11_observation_bkash_order_can_be_delivered_before_the_payment_is_checked(): void
    {
        $order = $this->webOrder($this->variant(stock: 5), 1, 'bkash');
        $this->move($order, 'confirmed', 'delivered');

        $this->assertSame('delivered', $order->status->value);
        $this->assertSame('pending_verification', $order->payment_status->value);
    }

    #[Test]
    public function l12_new_sale_to_be_shipped_with_part_payment_shows_what_is_still_due(): void
    {
        $variant = $this->variant(price: '1000.00', stock: 5);
        $id = $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', [
            'channel' => 'facebook', 'status' => 'confirmed',
            'customer' => ['name' => 'Facebook buyer', 'phone' => '01755555555'],
            'shipping' => ['address' => 'House 9, Road 1', 'city' => 'Rajshahi', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $variant->id, 'quantity' => 2]],
            'payment' => ['method' => 'bkash', 'amount' => '500', 'transaction_id' => 'ADV12345678'],
        ])->assertCreated()->assertJsonPath('data.grand_total', '2070.00')->assertJsonPath('data.payment_status', 'partially_paid')->json('data.id');

        $order = Order::query()->findOrFail($id);
        $this->assertSame(2, $variant->refresh()->stock_reserved);
        $this->move($order, 'shipped', 'delivered');

        // not cash on delivery, so delivery does not record the rest automatically
        $this->assertSame('partially_paid', $order->refresh()->payment_status->value);
        $this->actingAs($this->staff)->postJson("/api/v1/admin/orders/{$id}/payments", ['method' => 'cash', 'amount' => '1570'])->assertCreated();
        $this->assertSame('paid', $order->refresh()->payment_status->value);
    }

    // ───────────────────────── management ─────────────────────────

    #[Test]
    public function l13_shipping_details_and_notes(): void
    {
        $order = $this->webOrder($this->variant(stock: 5), 1);
        $this->actingAs($this->staff);

        $this->patchJson("/api/v1/admin/orders/{$order->id}/shipping", ['shipping_address' => 'New flat 4B', 'courier_name' => 'Pathao', 'tracking_code' => 'PT9'])->assertOk()->assertJsonPath('data.shipping.address', 'New flat 4B');
        $this->patchJson("/api/v1/admin/orders/{$order->id}/shipping", ['delivery_cost' => '-1'])->assertJsonValidationErrors('delivery_cost');

        $this->postJson("/api/v1/admin/orders/{$order->id}/notes", ['body' => ''])->assertJsonValidationErrors('body');
        $this->postJson("/api/v1/admin/orders/{$order->id}/notes", ['body' => str_repeat('x', 2001)])->assertJsonValidationErrors('body');
        $this->postJson("/api/v1/admin/orders/{$order->id}/notes", ['body' => '<script>alert(1)</script> customer wants gift wrap'])
            ->assertOk()->assertJsonPath('data.notes.0.body', '<script>alert(1)</script> customer wants gift wrap')->assertJsonPath('data.notes.0.user.id', $this->staff->id);
    }

    #[Test]
    public function l14_fixed_address_is_locked_once_an_order_is_finished_courier_cost_is_not(): void
    {
        $order = $this->webOrder($this->variant(stock: 5), 1);
        $this->move($order, 'cancelled');

        // FIXED (my call 6): the address is part of the record once cancelled / delivered / returned
        $this->actingAs($this->staff)->patchJson("/api/v1/admin/orders/{$order->id}/shipping", ['shipping_address' => 'Changed after cancel'])->assertJsonValidationErrors('shipping_address');
        // the courier bill often arrives later, so its cost stays editable
        $this->actingAs($this->staff)->patchJson("/api/v1/admin/orders/{$order->id}/shipping", ['delivery_cost' => '120'])->assertOk();
        $this->assertSame('120.00', $order->refresh()->delivery_cost);
    }

    #[Test]
    public function l15_admin_order_list_search_and_filters(): void
    {
        $variant = $this->variant(stock: 50);
        $first = $this->webOrder($variant, 1);
        $second = $this->webOrder($variant, 1);
        $this->move($second, 'cancelled');
        $this->actingAs($this->owner)->postJson('/api/v1/admin/manual-sales', [
            'channel' => 'whatsapp', 'status' => 'delivered', 'items' => [['variant_id' => $variant->id, 'quantity' => 1]], 'payment' => ['method' => 'cash'],
        ])->assertCreated();

        $this->getJson('/api/v1/admin/orders')->assertOk()->assertJsonPath('meta.total', 3);
        $this->getJson('/api/v1/admin/orders?status=cancelled')->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/orders?source=manual')->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/orders?channel=whatsapp')->assertJsonPath('meta.total', 1);
        $this->getJson("/api/v1/admin/orders?q={$first->order_number}")->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/orders?q='.substr($first->customer_phone, -6))->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/orders?q=%25')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson('/api/v1/admin/orders?from='.now()->toDateString().'&to='.now()->toDateString())->assertJsonPath('meta.total', 3);
        $this->getJson('/api/v1/admin/orders?from='.now()->addDay()->toDateString())->assertJsonPath('meta.total', 0);
    }

    #[Test]
    public function l16_cancelling_gives_the_coupon_use_back(): void
    {
        $variant = $this->variant(stock: 5);
        Coupon::factory()->create(['code' => 'ONCE', 'type' => 'fixed', 'value' => '100', 'usage_limit' => 1, 'is_active' => true]);
        $payload = $this->payload([[$variant, 1]]);
        $payload['coupon_code'] = 'ONCE';

        $order = Order::query()->where('uuid', $this->postJson('/api/v1/checkout', $payload)->assertCreated()->json('data.uuid'))->firstOrFail();
        $this->postJson('/api/v1/checkout', array_merge($this->payload([[$variant, 1]]), ['coupon_code' => 'ONCE']))->assertJsonValidationErrors('coupon_code');

        $this->move($order, 'cancelled');
        $this->assertSame(0, Coupon::query()->where('code', 'ONCE')->value('used_count'));
        $this->postJson('/api/v1/checkout', array_merge($this->payload([[$variant, 1]]), ['coupon_code' => 'ONCE']))->assertCreated();
    }

    // ───────────────────────── customer side ─────────────────────────

    #[Test]
    public function l17_order_tracking_by_number_and_phone_reveals_nothing_private(): void
    {
        $order = $this->webOrder($this->variant(stock: 5), 1);
        $this->actingAs($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/notes", ['body' => 'Customer is rude, check twice'])->assertOk();
        $this->move($order, 'confirmed');
        $local = $order->customer_phone;                         // 0171xxxxxxx
        $international = '+880'.substr($local, 1);

        $tracked = $this->postJson('/api/v1/orders/track', ['order_number' => strtolower($order->order_number), 'phone' => $international])->assertOk();
        $tracked->assertJsonPath('data.status', 'confirmed')->assertJsonMissingPath('data.items.0.unit_cost');
        $this->assertStringNotContainsString('rude', $tracked->getContent());
        $this->assertStringNotContainsString($local, $tracked->getContent(), 'phone is masked');

        $this->postJson('/api/v1/orders/track', ['order_number' => $order->order_number, 'phone' => '01999999999'])->assertNotFound();
        $this->postJson('/api/v1/orders/track', ['order_number' => 'NK999999', 'phone' => $local])->assertNotFound();
        $this->getJson("/api/v1/orders/{$order->uuid}")->assertOk()->assertJsonPath('data.order_number', $order->order_number);
        $this->getJson('/api/v1/orders/not-a-uuid')->assertNotFound();
    }

    #[Test]
    public function l18_customer_record_and_history_in_admin(): void
    {
        $variant = $this->variant(price: '1000.00', stock: 20);
        $payload = $this->payload([[$variant, 1]]);
        $phone = $payload['customer']['phone'];

        $delivered = app(OrderService::class)->placeWebsiteOrder($payload);
        $this->move($delivered, 'confirmed', 'delivered');
        $cancelled = app(OrderService::class)->placeWebsiteOrder(array_replace_recursive($payload, ['customer' => ['name' => 'New Name']]));
        $this->move($cancelled, 'cancelled');
        $returned = app(OrderService::class)->placeWebsiteOrder($payload);
        $this->move($returned, 'confirmed', 'delivered', 'returned');

        $this->assertSame(1, Customer::query()->where('phone', $phone)->count(), 'one customer per phone');
        $customer = Customer::query()->where('phone', $phone)->firstOrFail();

        $data = $this->actingAs($this->owner)->getJson("/api/v1/admin/customers/{$customer->id}")->assertOk()->json('data');
        $this->assertCount(3, $data['orders']);
        // only the delivered order (৳1,070) is a real purchase; cancelled and returned are not
        $this->assertSame('1070.00', $data['total_purchases']);
        // "Orders" counts every order not cancelled (returned included), "Total bought" only
        // shipped + delivered. The customer page divides one by the other as the average
        // order value: ৳1,070 ÷ 2 = ৳535, though the customer's one real purchase was ৳1,070 (BUG-003).
        $this->assertSame(2, $data['orders_count']);
        $this->assertSame('535.00', number_format((float) $data['total_purchases'] / $data['orders_count'], 2, '.', ''));
    }

    // ───────────────────────── helpers ─────────────────────────

    /** @return array{0: int, 1: int} on-hand, reserved for an order of 2 from 10 */
    private function expectedStock(string $status): array
    {
        return match ($status) {
            'pending', 'confirmed', 'processing' => [10, 2],
            'shipped', 'delivered' => [8, 0],
            'cancelled', 'returned' => [10, 0],
        };
    }

    private function assertLedger(ProductVariant $variant, int $opening): void
    {
        $this->assertSame($variant->stock_on_hand, $opening + (int) InventoryMovement::query()->where('variant_id', $variant->id)->sum('on_hand_delta'));
        $this->assertSame($variant->stock_reserved, (int) InventoryMovement::query()->where('variant_id', $variant->id)->sum('reserved_delta'));
    }

    private function variant(string $price = '1000.00', int $stock = 10): ProductVariant
    {
        return ProductVariant::factory()->for(Product::factory()->for($this->category))->withStock($stock)->create(['price' => $price, 'is_default' => true])->load('product');
    }

    private function webOrder(ProductVariant $variant, int $quantity, string $method = 'cod'): Order
    {
        return app(OrderService::class)->placeWebsiteOrder($this->payload([[$variant, $quantity]], $method));
    }

    /**
     * @param  list<array{0: ProductVariant, 1: int}>  $lines
     * @return array<string, mixed>
     */
    private function payload(array $lines, string $method = 'cod'): array
    {
        $this->phoneSeq++;
        $payment = ['method' => $method];
        if ($method === 'bkash') {
            $payment += ['sender_number' => '01811111111', 'transaction_id' => $this->phoneSeq === 1 ? 'TRX8A1B2C3D' : 'TRX'.str_pad((string) $this->phoneSeq, 8, '0', STR_PAD_LEFT)];
        }

        return [
            'customer' => ['name' => "QA Customer {$this->phoneSeq}", 'phone' => '0171'.str_pad((string) $this->phoneSeq, 7, '0', STR_PAD_LEFT)],
            'shipping' => ['address' => 'House 1, Road 2', 'area' => 'Mirpur', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => array_map(fn ($line) => ['variant_id' => $line[0]->id, 'quantity' => $line[1]], $lines),
            'payment' => $payment,
        ];
    }

    private function move(Order $order, string ...$statuses): void
    {
        foreach ($statuses as $status) {
            $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => $status])->assertOk();
        }
        $order->refresh();
    }
}
