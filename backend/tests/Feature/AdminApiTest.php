<?php

namespace Tests\Feature;

use App\Enums\MovementType;
use App\Enums\ProductStatus;
use App\Models\Category;
use App\Models\DeliveryZone;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\OrderService;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AdminApiTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(StoreSettingSeeder::class);
        $this->owner = User::factory()->owner()->create(['email' => 'owner@example.com']);
        $this->staff = User::factory()->create();
    }

    #[Test]
    public function guests_cannot_reach_admin_endpoints(): void
    {
        $this->getJson('/api/v1/admin/dashboard')->assertUnauthorized();
        $this->getJson('/api/v1/admin/orders')->assertUnauthorized();
    }

    #[Test]
    public function owner_logs_in_with_session_cookie(): void
    {
        $this->withHeader('Origin', 'http://localhost:3000')
            ->postJson('/api/v1/admin/login', ['email' => 'owner@example.com', 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('data.role', 'owner')
            ->assertJsonPath('data.permissions.view_financials', true);

        $this->assertAuthenticatedAs($this->owner);
    }

    #[Test]
    public function wrong_password_and_inactive_accounts_are_rejected(): void
    {
        $this->withHeader('Origin', 'http://localhost:3000')
            ->postJson('/api/v1/admin/login', ['email' => 'owner@example.com', 'password' => 'wrong'])
            ->assertUnprocessable();

        $inactive = User::factory()->inactive()->create();

        $this->withHeader('Origin', 'http://localhost:3000')
            ->postJson('/api/v1/admin/login', ['email' => $inactive->email, 'password' => 'password'])
            ->assertUnprocessable();

        $this->actingAs($inactive)->getJson('/api/v1/admin/me')->assertForbidden();
    }

    #[Test]
    public function staff_cannot_see_money_areas(): void
    {
        $this->actingAs($this->staff);

        $this->getJson('/api/v1/admin/reports/summary')->assertForbidden();
        $this->getJson('/api/v1/admin/expenses')->assertForbidden();
        $this->getJson('/api/v1/admin/settings')->assertForbidden();
        $this->getJson('/api/v1/admin/coupons')->assertForbidden();
        $this->getJson('/api/v1/admin/users')->assertForbidden();

        $this->getJson('/api/v1/admin/dashboard')
            ->assertOk()
            ->assertJsonMissingPath('data.cards.net_profit');
    }

    #[Test]
    public function owner_sees_profit_on_dashboard_and_reports(): void
    {
        $this->actingAs($this->owner);

        $this->getJson('/api/v1/admin/dashboard')->assertOk()->assertJsonStructure(['data' => ['cards' => ['net_profit', 'gross_profit'], 'sales_chart', 'low_stock', 'attention']]);
        $this->getJson('/api/v1/admin/reports/summary?from=2026-01-01&to=2026-01-31')->assertOk()->assertJsonStructure(['data' => ['realized' => ['net_profit'], 'estimated']]);
        $this->getJson('/api/v1/admin/reports/monthly')->assertOk();
    }

    #[Test]
    public function owner_creates_product_with_variants_costs_and_opening_stock(): void
    {
        $category = Category::factory()->create();

        $response = $this->actingAs($this->owner)->postJson('/api/v1/admin/products', [
            'category_id' => $category->id,
            'name' => 'Kundan Jhumka',
            'status' => 'active',
            'variants' => [
                ['sku' => 'KJ-GOLD', 'title' => 'Gold', 'options' => ['Color' => 'Gold'], 'price' => '1450', 'raw_material_cost' => '400', 'labour_cost' => '150', 'packaging_cost' => '30', 'initial_stock' => 8],
                ['sku' => 'KJ-SILVER', 'title' => 'Silver', 'options' => ['Color' => 'Silver'], 'price' => '1350', 'raw_material_cost' => '350'],
            ],
        ])->assertCreated();

        $response->assertJsonPath('data.slug', 'kundan-jhumka')
            ->assertJsonPath('data.variants.0.total_cost', '580.00')
            ->assertJsonPath('data.variants.0.stock_on_hand', 8)
            ->assertJsonPath('data.variants.0.is_default', true);

        $variant = ProductVariant::query()->where('sku', 'KJ-GOLD')->first();
        $this->assertDatabaseHas('inventory_movements', ['variant_id' => $variant->id, 'type' => MovementType::Purchase->value, 'on_hand_delta' => 8, 'user_id' => $this->owner->id]);
    }

    #[Test]
    public function staff_cannot_set_or_see_costs(): void
    {
        $category = Category::factory()->create();

        $response = $this->actingAs($this->staff)->postJson('/api/v1/admin/products', [
            'category_id' => $category->id,
            'name' => 'Pearl Studs',
            'variants' => [['sku' => 'PS-1', 'price' => '900', 'raw_material_cost' => '1']],
        ])->assertCreated();

        $response->assertJsonMissingPath('data.variants.0.total_cost');
        $this->assertSame('0.00', ProductVariant::query()->where('sku', 'PS-1')->value('raw_material_cost'));
    }

    #[Test]
    public function duplicate_sku_is_rejected(): void
    {
        ProductVariant::factory()->create(['sku' => 'TAKEN-1']);

        $this->actingAs($this->owner)->postJson('/api/v1/admin/products', [
            'category_id' => Category::factory()->create()->id,
            'name' => 'Copy',
            'variants' => [['sku' => 'TAKEN-1', 'price' => '100']],
        ])->assertUnprocessable()->assertJsonValidationErrors('variants.0.sku');
    }

    #[Test]
    public function product_images_are_converted_to_webp_in_three_sizes(): void
    {
        Storage::fake('public');
        $product = Product::factory()->withDefaultVariant()->create();

        $response = $this->actingAs($this->staff)->post("/api/v1/admin/products/{$product->id}/images", [
            'images' => [UploadedFile::fake()->image('ring.jpg', 2400, 1800)],
        ], ['Accept' => 'application/json'])->assertOk();

        $path = $product->images()->value('path');
        $base = substr($path, 0, -5);

        Storage::disk('public')->assertExists([$path, "{$base}_md.webp", "{$base}_sm.webp"]);
        $this->assertSame(1600, $response->json('data.0.width'));
        $this->assertTrue($product->images()->value('is_primary'));
    }

    #[Test]
    public function try_on_photo_keeps_transparency_and_is_exposed_on_the_storefront(): void
    {
        Storage::fake('public');
        $product = Product::factory()->withDefaultVariant()->create();
        $this->actingAs($this->staff)->putJson("/api/v1/admin/products/{$product->id}", ['status' => 'active', 'tryon_type' => 'earring', 'tryon_size_mm' => 52])->assertOk();

        // transparent 300x600 PNG with a solid block in the middle
        $canvas = imagecreatetruecolor(300, 600);
        imagesavealpha($canvas, true);
        imagefill($canvas, 0, 0, imagecolorallocatealpha($canvas, 0, 0, 0, 127));
        imagefilledrectangle($canvas, 100, 200, 200, 400, imagecolorallocate($canvas, 200, 30, 80));
        $file = tempnam(sys_get_temp_dir(), 'tryon').'.png';
        imagepng($canvas, $file);

        $this->actingAs($this->staff)->post("/api/v1/admin/products/{$product->id}/tryon", [
            'image' => new UploadedFile($file, 'earring.png', 'image/png', null, true),
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.tryon.type', 'earring');

        $product->refresh();
        $path = $product->tryon_image_path;
        Storage::disk('public')->assertExists($path);
        $stored = imagecreatefromstring(Storage::disk('public')->get($path));
        $this->assertSame(127, (imagecolorat($stored, 5, 5) >> 24) & 0x7F, 'corner stays fully transparent');

        $this->getJson("/api/v1/products/{$product->slug}")
            ->assertOk()
            ->assertJsonPath('data.tryon.type', 'earring')
            ->assertJsonPath('data.tryon.size_mm', 52)
            ->assertJsonPath('data.tryon.image_path', $path);

        $this->actingAs($this->staff)->deleteJson("/api/v1/admin/products/{$product->id}/tryon")->assertOk();
        Storage::disk('public')->assertMissing($path);
        $this->getJson("/api/v1/products/{$product->slug}")->assertJsonPath('data.tryon', null);
    }

    #[Test]
    public function product_with_sales_history_is_archived_not_deleted(): void
    {
        $variant = ProductVariant::factory()->for(Product::factory())->withStock(5)->create();
        $this->manualSale($variant);

        $this->actingAs($this->owner)->deleteJson("/api/v1/admin/products/{$variant->product_id}")
            ->assertOk()
            ->assertJsonPath('archived', true);

        $this->assertSame(ProductStatus::Archived, Product::query()->find($variant->product_id)->status);
    }

    #[Test]
    public function staff_records_manual_sale_and_stock_drops(): void
    {
        $variant = ProductVariant::factory()->for(Product::factory())->withStock(5)->create();

        $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', [
            'channel' => 'whatsapp',
            'status' => 'delivered',
            'items' => [['variant_id' => $variant->id, 'quantity' => 2]],
            'payment' => ['method' => 'bkash', 'transaction_id' => 'POS12345'],
        ])
            ->assertCreated()
            ->assertJsonPath('data.channel', 'whatsapp')
            ->assertJsonPath('data.payment_status', 'paid')
            ->assertJsonMissingPath('data.cogs_total');

        $this->assertSame(3, $variant->refresh()->stock_on_hand);
    }

    #[Test]
    public function invalid_status_change_returns_conflict(): void
    {
        $order = $this->manualSale(ProductVariant::factory()->for(Product::factory())->withStock(5)->create());

        $this->actingAs($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/status", ['status' => 'pending'])
            ->assertConflict();
    }

    #[Test]
    public function staff_verifies_bkash_payment(): void
    {
        $variant = ProductVariant::factory()->for(Product::factory())->withStock(5)->create();
        $zone = DeliveryZone::factory()->create();
        $order = app(OrderService::class)->placeWebsiteOrder([
            'customer' => ['name' => 'Ayesha', 'phone' => '01712345678'],
            'shipping' => ['address' => 'Road 5', 'city' => 'Dhaka', 'delivery_zone_id' => $zone->id],
            'items' => [['variant_id' => $variant->id, 'quantity' => 1]],
            'payment' => ['method' => 'bkash', 'sender_number' => '01811111111', 'transaction_id' => 'TRX1234567'],
        ]);
        $payment = Payment::query()->where('order_id', $order->id)->first();

        $this->actingAs($this->staff)->getJson('/api/v1/admin/payments/pending')->assertOk()->assertJsonCount(1, 'data');

        $this->postJson("/api/v1/admin/payments/{$payment->id}/verify", ['fee' => '18.50'])->assertOk()->assertJsonPath('data.status', 'verified');
        $this->assertSame('paid', $order->refresh()->payment_status->value);

        $this->postJson("/api/v1/admin/payments/{$payment->id}/verify")->assertConflict();
    }

    #[Test]
    public function only_owner_can_refund_money_on_a_return(): void
    {
        $order = $this->manualSale(ProductVariant::factory()->for(Product::factory())->withStock(5)->create());
        $itemId = $order->items()->value('id');
        $payload = ['items' => [['order_item_id' => $itemId, 'quantity' => 1]], 'refund' => ['amount' => '1000', 'method' => 'cash']];

        $this->actingAs($this->staff)->postJson("/api/v1/admin/orders/{$order->id}/returns", $payload)->assertForbidden();

        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/returns", $payload)
            ->assertOk()
            ->assertJsonPath('data.payment_status', 'partially_refunded')
            ->assertJsonPath('data.items.0.returned_quantity', 1);
    }

    #[Test]
    public function stock_adjustment_cannot_remove_reserved_units(): void
    {
        $variant = ProductVariant::factory()->for(Product::factory())->withStock(5, 4)->create();

        $this->actingAs($this->staff)->postJson('/api/v1/admin/inventory/adjust', [
            'variant_id' => $variant->id, 'type' => 'adjustment_out', 'quantity' => 2, 'reason' => 'Broken',
        ])->assertUnprocessable();

        $this->postJson('/api/v1/admin/inventory/adjust', [
            'variant_id' => $variant->id, 'type' => 'purchase', 'quantity' => 10, 'reason' => 'New batch',
        ])->assertOk()->assertJsonPath('data.stock_on_hand', 15);
    }

    #[Test]
    public function owner_cannot_lock_themselves_out(): void
    {
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/users/{$this->owner->id}", ['is_active' => false])->assertForbidden();
        $this->patchJson("/api/v1/admin/users/{$this->owner->id}", ['role' => 'staff'])->assertForbidden();
        $this->patchJson("/api/v1/admin/users/{$this->staff->id}", ['is_active' => false])->assertOk();
    }

    #[Test]
    public function orders_can_be_searched_by_phone(): void
    {
        $order = $this->manualSale(ProductVariant::factory()->for(Product::factory())->withStock(5)->create(), phone: '01912345678');

        $this->actingAs($this->staff)->getJson('/api/v1/admin/orders?q=01912345678')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.order_number', $order->order_number);
    }

    private function manualSale(ProductVariant $variant, ?string $phone = null): Order
    {
        return app(OrderService::class)->createManualSale([
            'channel' => 'facebook',
            'status' => 'delivered',
            'customer' => $phone ? ['name' => 'Rina', 'phone' => $phone] : null,
            'items' => [['variant_id' => $variant->id, 'quantity' => 2]],
            'payment' => ['method' => 'cash'],
        ], $this->staff);
    }
}
