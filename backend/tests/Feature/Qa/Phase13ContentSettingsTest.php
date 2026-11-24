<?php

namespace Tests\Feature\Qa;

use App\Models\Banner;
use App\Models\Category;
use App\Models\DeliveryZone;
use App\Models\Page;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Review;
use App\Models\User;
use App\Notifications\NewWebsiteOrder;
use App\Services\OrderService;
use Database\Seeders\PageSeeder;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * QA audit, phase 13: reviews, banners, policy pages and settings — and whether each
 * change reaches the right place in the shop.
 */
#[Group('qa')]
class Phase13ContentSettingsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    private Product $product;

    private DeliveryZone $zone;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([StoreSettingSeeder::class, PageSeeder::class]);
        Storage::fake('public');
        $this->owner = User::factory()->owner()->create();
        $this->staff = User::factory()->create();
        $this->zone = DeliveryZone::factory()->create(['charge' => '70.00']);
        $this->product = Product::factory()->for(Category::factory())->create();
        ProductVariant::factory()->for($this->product)->withStock(50)->create(['price' => '1000.00', 'is_default' => true]);
    }

    // ───────────── reviews ─────────────

    #[Test]
    public function t1_customer_reviews_wait_for_approval_then_show_and_count(): void
    {
        $url = "/api/v1/products/{$this->product->slug}/reviews";
        $this->postJson($url, ['customer_name' => 'Rina', 'rating' => 0, 'comment' => 'Lovely earrings, thank you!'])->assertJsonValidationErrors('rating');
        $this->postJson($url, ['customer_name' => 'Rina', 'rating' => 6, 'comment' => 'Lovely earrings, thank you!'])->assertJsonValidationErrors('rating');
        $this->postJson($url, ['customer_name' => 'Rina', 'rating' => 5, 'comment' => 'Nice'])->assertJsonValidationErrors('comment');
        $this->postJson($url, ['customer_name' => 'Bot', 'rating' => 5, 'comment' => 'Buy cheap pills now!!', 'website' => 'spam.example'])->assertJsonValidationErrors('website');
        $this->postJson('/api/v1/products/no-such-product/reviews', ['customer_name' => 'Rina', 'rating' => 5, 'comment' => 'Lovely earrings, thank you!'])->assertNotFound();

        Cache::flush(); // 5 review submissions per hour per network: the refused ones above count too
        $this->postJson($url, ['customer_name' => 'Rina', 'rating' => 5, 'comment' => 'Lovely earrings, thank you!'])->assertCreated();
        $this->postJson($url, ['customer_name' => 'Mitu', 'rating' => 3, 'comment' => 'Pretty but a bit heavy.'])->assertCreated();
        $this->assertSame(0, count($this->getJson($url)->json('data')), 'nothing shows before approval');

        [$rina, $mitu] = Review::query()->orderBy('id')->get()->all();
        $this->actingAs($this->staff)->patchJson("/api/v1/admin/reviews/{$rina->id}", ['status' => 'approved'])->assertOk();
        $this->actingAs($this->staff)->patchJson("/api/v1/admin/reviews/{$mitu->id}", ['status' => 'rejected'])->assertOk();

        $shown = $this->getJson($url)->json('data');
        $this->assertCount(1, $shown);
        $this->assertSame('Rina', $shown[0]['customer_name']);
        $this->getJson('/api/v1/products?per_page=5')->assertJsonPath('data.0.rating', 5)->assertJsonPath('data.0.reviews_count', 1);
    }

    #[Test]
    public function t2_verified_buyer_needs_the_right_order_and_phone_duplicates_are_possible(): void
    {
        $order = app(OrderService::class)->placeWebsiteOrder([
            'customer' => ['name' => 'Rina', 'phone' => '01712345678'],
            'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $this->product->variants()->value('id'), 'quantity' => 1]],
            'payment' => ['method' => 'cod'],
        ]);
        $url = "/api/v1/products/{$this->product->slug}/reviews";
        $body = ['customer_name' => 'Rina', 'rating' => 5, 'comment' => 'Lovely earrings, thank you!'];

        $this->postJson($url, $body + ['order_number' => strtolower($order->order_number), 'phone' => '+8801712345678'])->assertCreated();
        $this->postJson($url, $body + ['order_number' => $order->order_number, 'phone' => '01999999999'])->assertCreated();
        $this->postJson($url, $body)->assertCreated();

        $this->assertSame([$order->id, null, null], Review::query()->orderBy('id')->pluck('order_id')->all(), 'only the matching order + phone is "verified"');
        // OBS: the same person can post the same review again (5 per hour per network); moderation catches it
    }

    #[Test]
    public function t3_shop_can_add_feature_and_delete_reviews(): void
    {
        $this->actingAs($this->staff)->postJson('/api/v1/admin/reviews', ['customer_name' => 'From Facebook', 'rating' => 5, 'comment' => 'Got my jhumka, love it', 'source' => 'facebook', 'is_featured' => true])
            ->assertCreated();
        $this->actingAs($this->staff)->postJson('/api/v1/admin/reviews', ['customer_name' => 'X', 'rating' => 9, 'comment' => 'x', 'source' => 'tiktok'])->assertJsonValidationErrors(['rating', 'source']);

        $this->getJson('/api/v1/home')->assertOk()->assertJsonPath('data.reviews.0.customer_name', 'From Facebook');
        $review = Review::query()->firstOrFail();
        $this->actingAs($this->staff)->deleteJson("/api/v1/admin/reviews/{$review->id}")->assertOk();
        $this->assertSame([], $this->getJson('/api/v1/home')->json('data.reviews'));
    }

    // ───────────── banners ─────────────

    #[Test]
    public function t4_banner_links_images_schedule_and_order(): void
    {
        $this->actingAs($this->staff);
        $make = fn (array $data) => $this->post('/api/v1/admin/banners', array_merge(['title' => 'Eid sale', 'placement' => 'promo', 'image' => UploadedFile::fake()->image('b.jpg', 1600, 900)], $data), ['Accept' => 'application/json']);

        $make(['link_url' => 'javascript:alert(1)'])->assertJsonValidationErrors('link_url');
        $make(['link_url' => 'http://insecure.example'])->assertJsonValidationErrors('link_url');
        $make(['image' => UploadedFile::fake()->createWithContent('b.jpg', 'not an image')])->assertJsonValidationErrors('image');
        $make(['title' => ''])->assertJsonValidationErrors('title');
        $make(['link_url' => '/shop', 'sort_order' => 2, 'title' => 'Second'])->assertSuccessful();
        $make(['link_url' => 'https://www.facebook.com/nakshazz', 'sort_order' => 1, 'title' => 'First'])->assertSuccessful();
        $make(['title' => 'Later', 'starts_at' => now()->addDay()->format('Y-m-d H:i')])->assertSuccessful();
        $make(['title' => 'Over', 'starts_at' => now()->subDays(3)->format('Y-m-d H:i'), 'ends_at' => now()->subDay()->format('Y-m-d H:i')])->assertSuccessful();
        $make(['title' => 'Off', 'is_active' => 0])->assertSuccessful();
        // FIXED OBS-24: a link starting with "//" would leave the site, so it is refused
        $make(['title' => 'Away', 'link_url' => '//other-site.example/login', 'is_active' => 0])->assertJsonValidationErrors('link_url');

        $this->assertSame(['First', 'Second'], array_column($this->getJson('/api/v1/home')->json('data.promo_banners'), 'title'));

        $banner = Banner::query()->where('title', 'Second')->firstOrFail();
        $files = Storage::disk('public')->allFiles();
        $this->deleteJson("/api/v1/admin/banners/{$banner->id}")->assertOk();
        $this->assertLessThan(count($files), count(Storage::disk('public')->allFiles()), 'image files removed with the banner');
    }

    // ───────────── pages ─────────────

    #[Test]
    public function t5_policy_pages_update_and_show(): void
    {
        $page = Page::query()->firstOrFail();
        $this->actingAs($this->staff)->putJson("/api/v1/admin/pages/{$page->slug}", ['title' => 'Returns within 3 days', 'body' => "## How\n\nMessage us within **3 days**.", 'seo_title' => 'Returns | Nakshazz', 'seo_description' => 'Our return rules'])->assertOk();
        $this->actingAs($this->staff)->putJson("/api/v1/admin/pages/{$page->slug}", ['body' => ''])->assertJsonValidationErrors('body');
        $this->actingAs($this->staff)->putJson("/api/v1/admin/pages/{$page->slug}", ['seo_title' => str_repeat('x', 71)])->assertJsonValidationErrors('seo_title');

        $this->getJson("/api/v1/pages/{$page->slug}")->assertOk()->assertJsonPath('data.title', 'Returns within 3 days')->assertJsonPath('data.seo.title', 'Returns | Nakshazz');
        $this->getJson('/api/v1/pages/no-such-page')->assertNotFound();
    }

    // ───────────── settings ─────────────

    #[Test]
    public function t6_store_settings_reach_the_shop_and_checkout(): void
    {
        $this->actingAs($this->owner)->postJson('/api/v1/admin/settings', [
            'store_name' => 'Nakshazz QA', 'phone' => '+880 1567-910032', 'facebook_url' => 'https://www.facebook.com/nakshazz',
            'bkash_enabled' => false, 'low_stock_threshold' => 60,
        ])->assertOk();
        $this->actingAs($this->owner)->postJson('/api/v1/admin/settings', ['facebook_url' => 'http://facebook.com/x'])->assertJsonValidationErrors('facebook_url');
        $this->actingAs($this->owner)->postJson('/api/v1/admin/settings', ['low_stock_threshold' => -1])->assertJsonValidationErrors('low_stock_threshold');

        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        $this->assertSame('Nakshazz QA', $public['store']['store_name'] ?? $public['store']['name'] ?? null);

        $payload = [
            'customer' => ['name' => 'Rina', 'phone' => '01712345678'],
            'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $this->product->variants()->value('id'), 'quantity' => 1]],
            'payment' => ['method' => 'bkash', 'sender_number' => '01811111111', 'transaction_id' => 'SET12345678'],
        ];
        $this->postJson('/api/v1/checkout', $payload)->assertJsonValidationErrors('payment.method');

        $lowStock = array_column($this->actingAs($this->owner)->getJson('/api/v1/admin/dashboard')->json('data.low_stock'), 'id');
        $this->assertContains($this->product->variants()->value('id'), $lowStock, '50 in stock is "low" under a threshold of 60');
    }

    #[Test]
    public function t7_delivery_charge_changes_apply_to_new_orders_only(): void
    {
        Cache::flush();
        $old = app(OrderService::class)->placeWebsiteOrder([
            'customer' => ['name' => 'Rina', 'phone' => '01712345678'],
            'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $this->product->variants()->value('id'), 'quantity' => 1]],
            'payment' => ['method' => 'cod'],
        ]);
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/delivery-zones/{$this->zone->id}", ['charge' => '90'])->assertOk();
        $this->actingAs($this->owner)->postJson('/api/v1/admin/delivery-zones', ['name' => 'Gazipur', 'charge' => '-5'])->assertJsonValidationErrors('charge');

        $new = app(OrderService::class)->placeWebsiteOrder([
            'customer' => ['name' => 'Mitu', 'phone' => '01812345678'],
            'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $this->product->variants()->value('id'), 'quantity' => 1]],
            'payment' => ['method' => 'cod'],
        ]);
        $this->assertSame(['70.00', '90.00'], [$old->delivery_charge, $new->delivery_charge]);
    }

    #[Test]
    public function t8_new_order_email_goes_to_the_address_set_in_settings(): void
    {
        Notification::fake();
        $this->withoutDefer();
        $this->actingAs($this->owner)->postJson('/api/v1/admin/settings', ['order_notification_email' => 'orders@nakshazz.test'])->assertOk();

        $this->postJson('/api/v1/checkout', [
            'customer' => ['name' => 'Rina', 'phone' => '01712345678'],
            'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $this->product->variants()->value('id'), 'quantity' => 1]],
            'payment' => ['method' => 'cod'],
        ])->assertCreated();

        Notification::assertSentTo(new AnonymousNotifiable, NewWebsiteOrder::class, fn ($n, $channels, $notifiable) => ($notifiable->routes['mail'] ?? null) === 'orders@nakshazz.test');
    }
}
