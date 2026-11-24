<?php

namespace Tests\Feature;

use App\Enums\ReviewStatus;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\DeliveryZone;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Notifications\NewWebsiteOrder;
use App\Notifications\OrderPlacedCustomer;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class StorefrontApiTest extends TestCase
{
    use RefreshDatabase;

    private DeliveryZone $zone;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(StoreSettingSeeder::class);
        $this->zone = DeliveryZone::factory()->create(['charge' => '70.00']);
    }

    #[Test]
    public function with_a_key_set_the_public_api_answers_only_our_own_website(): void
    {
        config(['store.api_key' => 'test-key', 'cors.allowed_origins' => ['https://shop.example']]);
        $this->product(['name' => 'Rose Jhumka']);

        // typed into a browser tab, or fetched by a script: no key, no origin
        $this->get('/api/v1/products', ['Accept' => 'text/html'])->assertUnauthorized()->assertExactJson(['message' => 'Unauthenticated.']);
        $this->getJson('/api/v1/products')->assertUnauthorized();
        // another website's page, or a wrong key
        $this->getJson('/api/v1/products', ['Origin' => 'https://evil.example'])->assertUnauthorized();
        $this->getJson('/api/v1/products', ['X-Storefront-Key' => 'wrong'])->assertUnauthorized();
        $this->postJson('/api/v1/cart/validate', ['items' => []])->assertUnauthorized();

        // the storefront's server (key) and a page of the storefront in a browser (origin / referer)
        $this->getJson('/api/v1/products', ['X-Storefront-Key' => 'test-key'])->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/products', ['Origin' => 'https://shop.example'])->assertOk();
        $this->getJson('/api/v1/products', ['Referer' => 'https://shop.example/shop?q=rose'])->assertOk();
    }

    #[Test]
    public function product_listing_shows_only_published_products_and_never_costs(): void
    {
        $published = $this->product(['name' => 'Rose Jhumka']);
        $this->product(['name' => 'Secret Draft'], draft: true);

        $response = $this->getJson('/api/v1/products')->assertOk();

        $response->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.slug', $published->slug)
            ->assertJsonPath('data.0.price', '1000.00');

        $this->assertStringNotContainsString('cost', $response->getContent());
        $this->assertStringNotContainsString('stock_on_hand', $response->getContent());
    }

    #[Test]
    public function products_filter_by_category_price_and_sort(): void
    {
        $earrings = Category::factory()->create(['slug' => 'earrings']);
        $cheap = $this->product(['category_id' => $earrings->id], price: '500.00');
        $pricey = $this->product(['category_id' => $earrings->id], price: '2500.00');
        $this->product([], price: '700.00');

        $this->getJson('/api/v1/products?category=earrings&sort=-price')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $pricey->id)
            ->assertJsonPath('data.1.id', $cheap->id);

        $this->getJson('/api/v1/products?min_price=600&max_price=1000')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->getJson('/api/v1/products?sort=hacked')->assertUnprocessable()->assertJsonValidationErrors('sort');
    }

    #[Test]
    public function search_term_is_treated_literally(): void
    {
        $this->product(['name' => 'Pearl Necklace']);

        $this->getJson('/api/v1/products?q=pearl')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/products?q=%25')->assertOk()->assertJsonCount(0, 'data');
    }

    #[Test]
    public function product_detail_returns_variants_and_hides_drafts(): void
    {
        $product = $this->product(['name' => 'Moon Ring']);
        $draft = $this->product([], draft: true);

        $this->getJson("/api/v1/products/{$product->slug}")
            ->assertOk()
            ->assertJsonPath('data.name', 'Moon Ring')
            ->assertJsonPath('data.variants.0.stock_status', 'in_stock')
            ->assertJsonMissingPath('data.variants.0.total_cost')
            ->assertJsonStructure(['data' => ['seo' => ['title', 'description'], 'related', 'reviews', 'images']]);

        $this->getJson("/api/v1/products/{$draft->slug}")->assertNotFound();
    }

    #[Test]
    public function checkout_creates_order_and_ignores_client_prices(): void
    {
        $variant = $this->product([], price: '1200.00')->variants->first();

        $payload = $this->checkoutPayload($variant);
        $payload['items'][0]['unit_price'] = '1.00';

        $this->postJson('/api/v1/checkout', $payload)
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.totals.grand_total', '2470.00')
            ->assertJsonPath('data.customer_phone', '017XXXXX678')
            ->assertJsonMissingPath('data.items.0.unit_cost');

        $this->assertSame(2, $variant->refresh()->stock_reserved);
    }

    #[Test]
    public function new_website_order_emails_the_owner_when_no_address_is_set(): void
    {
        Notification::fake();
        $this->withoutDefer();
        $owner = User::factory()->create(['role' => 'owner']);
        $staff = User::factory()->create(['role' => 'staff']);
        $former = User::factory()->create(['role' => 'owner', 'is_active' => false]);
        $variant = $this->product()->variants->first();

        $orderNumber = $this->postJson('/api/v1/checkout', $this->checkoutPayload($variant))->assertCreated()->json('data.order_number');

        Notification::assertSentTo($owner, NewWebsiteOrder::class, function (NewWebsiteOrder $notification, array $channels, User $user) use ($orderNumber) {
            $mail = $notification->toMail($user);

            return $notification->order->order_number === $orderNumber
                && str_contains($mail->subject, $orderNumber)
                && str_ends_with($mail->actionUrl, "/admin/orders/{$notification->order->id}");
        });
        Notification::assertNotSentTo([$staff, $former], NewWebsiteOrder::class);
    }

    #[Test]
    public function the_customer_gets_a_confirmation_email_only_when_they_gave_one(): void
    {
        Notification::fake();
        $this->withoutDefer();
        $variant = $this->product()->variants->first();

        // no email typed: nothing goes to the customer
        $this->postJson('/api/v1/checkout', $this->checkoutPayload($variant))->assertCreated();
        Notification::assertSentOnDemandTimes(OrderPlacedCustomer::class, 0);

        $payload = $this->checkoutPayload($variant);
        $payload['customer']['email'] = 'rina@example.com';
        $order = $this->postJson('/api/v1/checkout', $payload)->assertCreated()->json('data');

        Notification::assertSentOnDemand(OrderPlacedCustomer::class, function (OrderPlacedCustomer $notification, array $channels, object $notifiable) use ($order) {
            $mail = $notification->toMail($notifiable);

            return $notifiable->routes['mail'] === 'rina@example.com'
                && str_contains($mail->subject, $order['order_number'])
                && str_ends_with($mail->actionUrl, '/order/'.$order['uuid']);
        });
    }

    #[Test]
    public function checkout_conflict_when_stock_ran_out(): void
    {
        $variant = $this->product([], stock: 1)->variants->first();

        $response = $this->postJson('/api/v1/checkout', $this->checkoutPayload($variant))->assertConflict();

        $this->assertStringContainsString('Only 1', $response->json('errors')['items.0.quantity'][0]);
    }

    #[Test]
    public function checkout_validates_phone_bkash_fields_and_honeypot(): void
    {
        $variant = $this->product()->variants->first();

        $this->postJson('/api/v1/checkout', array_replace_recursive($this->checkoutPayload($variant), ['customer' => ['phone' => '12345']]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('customer.phone');

        $this->postJson('/api/v1/checkout', array_replace_recursive($this->checkoutPayload($variant), ['payment' => ['method' => 'bkash']]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['payment.transaction_id', 'payment.sender_number']);

        $this->postJson('/api/v1/checkout', $this->checkoutPayload($variant) + ['website' => 'http://spam.example'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('website');

        $this->assertSame(0, $variant->refresh()->stock_reserved);
    }

    #[Test]
    public function checkout_is_rate_limited_per_phone(): void
    {
        $variant = $this->product([], stock: 50)->variants->first();
        $payload = $this->checkoutPayload($variant);
        $payload['items'][0]['quantity'] = 1;

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/checkout', $payload)->assertCreated();
        }

        $this->postJson('/api/v1/checkout', $payload)->assertTooManyRequests();
    }

    #[Test]
    public function order_tracking_needs_matching_phone(): void
    {
        $variant = $this->product()->variants->first();
        $orderNumber = $this->postJson('/api/v1/checkout', $this->checkoutPayload($variant))->json('data.order_number');

        $this->postJson('/api/v1/orders/track', ['order_number' => strtolower($orderNumber), 'phone' => '+8801712345678'])
            ->assertOk()
            ->assertJsonPath('data.order_number', $orderNumber)
            ->assertJsonPath('data.timeline.0.status', 'pending');

        $this->postJson('/api/v1/orders/track', ['order_number' => $orderNumber, 'phone' => '01899999999'])
            ->assertNotFound();
    }

    #[Test]
    public function cart_validation_flags_stock_problems_and_bad_coupons(): void
    {
        $variant = $this->product([], stock: 2)->variants->first();
        Coupon::factory()->create(['code' => 'BIG', 'min_order_amount' => '5000.00']);

        $this->postJson('/api/v1/cart/validate', [
            'items' => [['variant_id' => $variant->id, 'quantity' => 5], ['variant_id' => 999999, 'quantity' => 1]],
            'coupon_code' => 'big',
            'delivery_zone_id' => $this->zone->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.lines.0.problem', 'insufficient_stock')
            ->assertJsonPath('data.lines.0.quantity', 2)
            ->assertJsonPath('data.lines.1.problem', 'unavailable')
            ->assertJsonPath('data.coupon.valid', false)
            ->assertJsonPath('data.totals.grand_total', '2070.00')
            ->assertJsonPath('data.has_problems', true);
    }

    #[Test]
    public function public_settings_hide_private_values(): void
    {
        $this->getJson('/api/v1/settings')
            ->assertOk()
            ->assertJsonPath('data.store.store_name', 'Nakshazz')
            ->assertJsonMissingPath('data.store.low_stock_threshold')
            ->assertJsonMissingPath('data.store.order_notification_email')
            ->assertJsonCount(2, 'data.payment_methods');
    }

    #[Test]
    public function submitted_review_waits_for_approval(): void
    {
        $product = $this->product();

        $this->postJson("/api/v1/products/{$product->slug}/reviews", [
            'customer_name' => 'Nusrat',
            'rating' => 5,
            'comment' => 'Beautiful <script>alert(1)</script> earrings!',
        ])->assertCreated();

        $this->assertDatabaseHas('reviews', ['product_id' => $product->id, 'status' => ReviewStatus::Pending->value, 'comment' => 'Beautiful alert(1) earrings!']);
        $this->getJson("/api/v1/products/{$product->slug}")->assertJsonCount(0, 'data.reviews');
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    #[Test]
    public function products_filter_by_colour_and_sale_and_facets_report_bounds(): void
    {
        $golden = $this->product(['name' => 'Golden Drops'], price: '300.00');
        $golden->variants->first()->update(['options' => ['Color' => 'Golden']]);
        $silver = $this->product(['name' => 'Silver Drops'], price: '700.00');
        $silver->variants->first()->update(['options' => ['Color' => 'Silver'], 'compare_at_price' => '900.00']);

        $this->getJson('/api/v1/products?color=Silver')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Silver Drops');

        $this->getJson('/api/v1/products?max_price=500')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Golden Drops');

        $this->getJson('/api/v1/products?on_sale=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Silver Drops');

        $this->getJson('/api/v1/products/facets')
            ->assertOk()
            ->assertJsonPath('data.price.min', 300)
            ->assertJsonPath('data.price.max', 700)
            ->assertJsonPath('data.on_sale', 1)
            ->assertJsonCount(2, 'data.colors');
    }

    private function product(array $attributes = [], string $price = '1000.00', int $stock = 10, bool $draft = false): Product
    {
        $factory = Product::factory()->state($attributes);

        if ($draft) {
            $factory = $factory->draft();
        }

        return $factory
            ->has(ProductVariant::factory()->state(['price' => $price, 'is_default' => true])->withStock($stock), 'variants')
            ->create()
            ->load('variants');
    }

    /**
     * @return array<string, mixed>
     */
    private function checkoutPayload(ProductVariant $variant): array
    {
        return [
            'customer' => ['name' => 'Ayesha Rahman', 'phone' => '01712345678'],
            'shipping' => ['address' => 'House 12, Road 5', 'area' => 'Dhanmondi', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $variant->id, 'quantity' => 2]],
            'payment' => ['method' => 'cod'],
        ];
    }
}
