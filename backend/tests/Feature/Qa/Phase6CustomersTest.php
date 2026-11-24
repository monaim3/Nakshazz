<?php

namespace Tests\Feature\Qa;

use App\Models\Category;
use App\Models\Customer;
use App\Models\DeliveryZone;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\OrderService;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * QA audit, phase 6: customers. There are no customer accounts (guest checkout by design):
 * a customer record is created or updated from each order, keyed by the phone number.
 */
#[Group('qa')]
class Phase6CustomersTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    private DeliveryZone $zone;

    private ProductVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(StoreSettingSeeder::class);
        $this->owner = User::factory()->owner()->create();
        $this->staff = User::factory()->create();
        $this->zone = DeliveryZone::factory()->create(['charge' => '70.00']);
        $this->variant = ProductVariant::factory()->for(Product::factory()->for(Category::factory()))->withStock(500)->create(['price' => '1000.00', 'is_default' => true]);
    }

    #[Test]
    public function c1_one_customer_per_phone_however_the_number_is_written(): void
    {
        foreach (['01712345678', '+8801712345678', '8801712345678', '017-1234-5678', ' 01712 345678 '] as $written) {
            $this->postJson('/api/v1/checkout', $this->payload($written))->assertCreated();
        }

        $this->assertSame(1, Customer::query()->count());
        $this->assertSame('01712345678', Customer::query()->value('phone'));
        $this->assertSame(5, Order::query()->where('customer_phone', '01712345678')->count());
        // the 5-orders-per-hour limit per phone also sees through a different way of writing it
        $this->postJson('/api/v1/checkout', $this->payload('+880 1712-345678'))->assertTooManyRequests();
    }

    #[Test]
    public function c2_invalid_phone_numbers_are_refused_everywhere(): void
    {
        foreach (['12345', '0171234567', '017123456789', '02712345678', '01212345678', 'abcdefghijk', '+44 7700 900123', ''] as $bad) {
            Cache::flush(); // the checkout limit (5 per phone per hour) would otherwise answer 429 first
            $this->postJson('/api/v1/checkout', $this->payload($bad))->assertJsonValidationErrors('customer.phone');
        }
        $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', [
            'channel' => 'facebook', 'status' => 'delivered', 'customer' => ['phone' => '12345'],
            'items' => [['variant_id' => $this->variant->id, 'quantity' => 1]], 'payment' => ['method' => 'cash'],
        ])->assertJsonValidationErrors('customer.phone');

        $this->assertSame(0, Customer::query()->count());
    }

    #[Test]
    public function c3_missing_or_bad_details_are_refused(): void
    {
        $this->postJson('/api/v1/checkout', array_replace_recursive($this->payload('01712345678'), ['customer' => ['name' => '']]))->assertJsonValidationErrors('customer.name');
        $this->postJson('/api/v1/checkout', array_replace_recursive($this->payload('01712345678'), ['customer' => ['name' => 'A']]))->assertJsonValidationErrors('customer.name');
        $this->postJson('/api/v1/checkout', array_replace_recursive($this->payload('01712345678'), ['customer' => ['email' => 'not-an-email']]))->assertJsonValidationErrors('customer.email');
        $this->postJson('/api/v1/checkout', array_replace_recursive($this->payload('01712345678'), ['shipping' => ['address' => 'abc']]))->assertJsonValidationErrors('shipping.address');
        $this->assertSame(0, Customer::query()->count());
    }

    #[Test]
    public function c4_walk_in_sale_without_a_phone_creates_no_customer_with_a_phone_links_one(): void
    {
        $sale = fn (?array $customer) => $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', array_filter([
            'channel' => 'physical_store', 'status' => 'delivered', 'customer' => $customer,
            'items' => [['variant_id' => $this->variant->id, 'quantity' => 1]], 'payment' => ['method' => 'cash'],
        ]))->assertCreated()->json('data');

        $walkIn = $sale(null);
        $this->assertNull($walkIn['customer_id']);
        $known = $sale(['name' => 'Shop visitor', 'phone' => '01812345678']);
        $this->assertNotNull($known['customer_id']);
        $this->assertSame(1, Customer::query()->count());
    }

    #[Test]
    public function c5_addresses_are_remembered_without_duplicates(): void
    {
        $this->postJson('/api/v1/checkout', $this->payload('01712345678', 'House 1, Road 2'))->assertCreated();
        $this->postJson('/api/v1/checkout', $this->payload('01712345678', 'House 1, Road 2'))->assertCreated();
        $this->postJson('/api/v1/checkout', $this->payload('01712345678', 'Flat 5C, Lake View'))->assertCreated();

        $customer = Customer::query()->firstOrFail();
        $this->assertSame(2, $customer->addresses()->count());
        // OBS: every remembered address is flagged default
        $this->assertSame(2, $customer->addresses()->where('is_default', true)->count());
    }

    #[Test]
    public function c6_a_later_order_overwrites_the_name_the_shop_edited(): void
    {
        $this->postJson('/api/v1/checkout', $this->payload('01712345678', name: 'rina'))->assertCreated();
        $customer = Customer::query()->firstOrFail();
        $this->actingAs($this->staff)->patchJson("/api/v1/admin/customers/{$customer->id}", ['name' => 'Rina Akter (VIP)', 'notes' => 'Prefers gold'])->assertOk();

        // she orders again, typing her name the short way, or orders a gift for her sister
        $this->postJson('/api/v1/checkout', $this->payload('01712345678', name: 'Sister Mitu'))->assertCreated();

        $customer->refresh();
        $this->assertSame('Sister Mitu', $customer->name, 'OBS: the edited name is replaced by the latest order');
        $this->assertSame('Prefers gold', $customer->notes, 'notes survive');
        $this->assertSame('rina', Order::query()->oldest('id')->value('customer_name'), 'each order keeps the name typed on it');
    }

    #[Test]
    public function c7_admin_customer_search_edit_and_validation(): void
    {
        $this->postJson('/api/v1/checkout', $this->payload('01712345678', name: 'Rina Akter', email: 'rina@example.com'))->assertCreated();
        $this->postJson('/api/v1/checkout', $this->payload('01812345678', name: 'Mitu Das'))->assertCreated();
        $this->actingAs($this->staff);

        $this->getJson('/api/v1/admin/customers')->assertOk()->assertJsonPath('meta.total', 2);
        $this->getJson('/api/v1/admin/customers?q=rina')->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/customers?q=018123')->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/customers?q=example.com')->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/customers?q=%25')->assertJsonPath('meta.total', 0);

        $id = Customer::query()->where('phone', '01812345678')->value('id');
        $this->patchJson("/api/v1/admin/customers/{$id}", ['email' => 'bad'])->assertJsonValidationErrors('email');
        $this->patchJson("/api/v1/admin/customers/{$id}", ['phone' => '01999999999', 'name' => 'Mitu D.'])->assertOk()->assertJsonPath('data.phone', '01812345678')->assertJsonPath('data.name', 'Mitu D.');
        $this->getJson('/api/v1/admin/customers/999999')->assertNotFound();
        $this->getJson("/api/v1/admin/customers/{$id}")->assertOk()->assertJsonPath('data.orders_count', 1);
    }

    #[Test]
    public function c8_a_customer_with_120_orders_counts_all_of_them_and_lists_the_latest_50(): void
    {
        $orders = app(OrderService::class);
        foreach (range(1, 120) as $i) {
            $orders->placeWebsiteOrder($this->payload('01712345678'));
        }
        $customer = Customer::query()->firstOrFail();

        $start = microtime(true);
        $data = $this->actingAs($this->owner)->getJson("/api/v1/admin/customers/{$customer->id}")->assertOk()->json('data');
        $ms = (microtime(true) - $start) * 1000;

        $this->assertSame(120, $data['orders_count']);
        $this->assertCount(50, $data['orders']);
        $this->assertLessThan(2000, $ms, 'customer page answers quickly');
        $this->actingAs($this->owner)->getJson('/api/v1/admin/customers')->assertOk()->assertJsonPath('data.0.orders_count', 120);
    }

    #[Test]
    public function c9_customers_are_never_deleted_and_orders_keep_their_own_copy(): void
    {
        $this->postJson('/api/v1/checkout', $this->payload('01712345678', name: 'Rina'))->assertCreated();
        $customer = Customer::query()->firstOrFail();

        $this->actingAs($this->owner)->deleteJson("/api/v1/admin/customers/{$customer->id}")->assertStatus(405);
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/customers/{$customer->id}", ['name' => 'Renamed'])->assertOk();
        $this->assertSame('Rina', Order::query()->value('customer_name'));
    }

    /** @return array<string, mixed> */
    private function payload(string $phone, string $address = 'House 1, Road 2', string $name = 'QA Customer', ?string $email = null): array
    {
        return [
            'customer' => array_filter(['name' => $name, 'phone' => $phone, 'email' => $email]),
            'shipping' => ['address' => $address, 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $this->variant->id, 'quantity' => 1]],
            'payment' => ['method' => 'cod'],
        ];
    }
}
