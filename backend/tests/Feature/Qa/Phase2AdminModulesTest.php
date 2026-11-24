<?php

namespace Tests\Feature\Qa;

use App\Models\Category;
use App\Models\DeliveryZone;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\OrderService;
use App\Services\ReportService;
use Carbon\CarbonImmutable;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * QA audit, phase 2: admin modules (dashboard, products, variants, categories, inventory).
 * Run with: php artisan test --group=qa
 * A failing test here is evidence of a bug, recorded in docs/qa/QA-PROGRESS.md.
 */
#[Group('qa')]
class Phase2AdminModulesTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    private Category $category;

    private DeliveryZone $zone;

    private int $phoneSeq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(StoreSettingSeeder::class);
        Storage::fake('public');
        $this->owner = User::factory()->owner()->create();
        $this->staff = User::factory()->create();
        $this->category = Category::factory()->create();
        $this->zone = DeliveryZone::factory()->create(['charge' => '70.00']);
    }

    // ───────────────────────── 2.1 Dashboard ─────────────────────────

    #[Test]
    public function d1_empty_store_dashboard_shows_zeros_without_errors(): void
    {
        $this->actingAs($this->owner)->getJson('/api/v1/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('data.cards.total_orders', 0)
            ->assertJsonPath('data.cards.total_revenue', '0.00')
            ->assertJsonPath('data.attention.pending_orders', 0);
    }

    #[Test]
    public function d2_dashboard_sales_by_source_matches_reports_after_a_partial_return(): void
    {
        $variant = $this->variant(price: '1000.00', stock: 10);
        $order = $this->webOrder($variant, 2);
        $this->move($order, 'confirmed', 'delivered');
        $item = $order->items()->first();
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/returns", ['items' => [['order_item_id' => $item->id, 'quantity' => 1]]])->assertOk();

        $cards = $this->actingAs($this->owner)->getJson('/api/v1/admin/dashboard')->assertOk()->json('data.cards');
        $report = app(ReportService::class)->summary(CarbonImmutable::today()->subDays(29), CarbonImmutable::today())['realized'];

        $this->assertSame('1000.00', $report['product_revenue'], 'Report: 1 of 2 units kept');
        $this->assertSame($report['product_revenue'], $cards['total_revenue'], 'Revenue card = report');
        // R5: the "Website sales" card must agree with total revenue (all sales here are website sales)
        $this->assertSame($cards['total_revenue'], $cards['website_sales'], 'Website sales card ignores the returned unit');
    }

    #[Test]
    public function d3_cancelled_orders_count_nowhere_in_revenue_or_chart(): void
    {
        $variant = $this->variant(stock: 10);
        $order = $this->webOrder($variant, 1);
        $this->move($order, 'cancelled');

        $data = $this->actingAs($this->owner)->getJson('/api/v1/admin/dashboard')->assertOk()->json('data');

        $this->assertSame('0.00', $data['cards']['total_revenue']);
        $this->assertSame(0, $data['cards']['total_orders']);
        $this->assertSame(0, collect($data['sales_chart'])->sum('orders'));
    }

    #[Test]
    public function d4_year_boundary_in_dhaka_time_puts_each_sale_in_its_own_month(): void
    {
        $variant = $this->variant(stock: 10);

        $this->travelTo(CarbonImmutable::parse('2026-12-31 23:50:00', 'Asia/Dhaka'));
        $this->move($this->webOrder($variant, 1), 'confirmed', 'delivered');
        $this->travelTo(CarbonImmutable::parse('2027-01-01 00:10:00', 'Asia/Dhaka'));
        $this->move($this->webOrder($variant, 1), 'confirmed', 'delivered');

        $reports = app(ReportService::class);
        $this->assertSame(1, $reports->summary(CarbonImmutable::parse('2026-12-01'), CarbonImmutable::parse('2026-12-31'))['realized']['orders']);
        $this->assertSame(1, $reports->summary(CarbonImmutable::parse('2027-01-01'), CarbonImmutable::parse('2027-01-31'))['realized']['orders']);
        $this->assertSame(['2026-12', '2027-01'], array_column($reports->monthly(CarbonImmutable::parse('2026-12-01'), CarbonImmutable::parse('2027-01-31')), 'month'));
    }

    #[Test]
    public function d5_staff_dashboard_hides_profit(): void
    {
        $this->actingAs($this->staff)->getJson('/api/v1/admin/dashboard')
            ->assertOk()
            ->assertJsonMissingPath('data.cards.gross_profit')
            ->assertJsonMissingPath('data.cards.net_profit');
    }

    // ───────────────────────── 2.2 Products ─────────────────────────

    #[Test]
    public function p1_product_validation_rejects_bad_input(): void
    {
        $this->actingAs($this->owner);
        $this->postJson('/api/v1/admin/products', $this->productPayload(['name' => '']))->assertJsonValidationErrors('name');
        $this->postJson('/api/v1/admin/products', $this->productPayload(['name' => str_repeat('a', 151)]))->assertJsonValidationErrors('name');
        $this->postJson('/api/v1/admin/products', $this->productPayload([], [['sku' => 'NEG-1', 'price' => '-5']]))->assertJsonValidationErrors('variants.0.price');
        $this->postJson('/api/v1/admin/products', $this->productPayload([], [['sku' => 'BIG-1', 'price' => '10000000']]))->assertJsonValidationErrors('variants.0.price');
        $this->postJson('/api/v1/admin/products', $this->productPayload([], []))->assertJsonValidationErrors('variants');
        $this->postJson('/api/v1/admin/products', $this->productPayload([], [['sku' => 'bad sku!', 'price' => '100']]))->assertJsonValidationErrors('variants.0.sku');
    }

    #[Test]
    public function p2_observation_zero_price_and_compare_at_below_price_are_accepted(): void
    {
        // No rule forbids a ৳0 product or a "was" price lower than the price. Recorded as an observation.
        $this->actingAs($this->owner)->postJson('/api/v1/admin/products', $this->productPayload([], [['sku' => 'ZERO-1', 'price' => '0', 'compare_at_price' => '0']]))->assertCreated();
        $this->actingAs($this->owner)->postJson('/api/v1/admin/products', $this->productPayload([], [['sku' => 'LOWCMP-1', 'price' => '500', 'compare_at_price' => '300']]))->assertCreated();
    }

    #[Test]
    public function p3_duplicate_sku_is_rejected_across_products_and_within_one(): void
    {
        $this->actingAs($this->owner)->postJson('/api/v1/admin/products', $this->productPayload([], [['sku' => 'DUP-1', 'price' => '100']]))->assertCreated();
        $this->postJson('/api/v1/admin/products', $this->productPayload([], [['sku' => 'dup-1', 'price' => '100']]))->assertJsonValidationErrors('variants.0.sku');
        $this->postJson('/api/v1/admin/products', $this->productPayload([], [['sku' => 'TWO-1', 'price' => '100'], ['sku' => 'two-1', 'price' => '100']]))->assertJsonValidationErrors('variants.1.sku');
    }

    #[Test]
    public function p4_special_characters_in_names_still_give_a_working_unique_slug(): void
    {
        $this->actingAs($this->owner);
        $first = $this->postJson('/api/v1/admin/products', $this->productPayload(['name' => 'Jhumka & Co. — "Rose" <b>'], [['sku' => 'SP-1', 'price' => '100']]))->assertCreated()->json('data.slug');
        $second = $this->postJson('/api/v1/admin/products', $this->productPayload(['name' => 'Jhumka & Co. — "Rose" <b>'], [['sku' => 'SP-2', 'price' => '100']]))->assertCreated()->json('data.slug');
        $bangla = $this->postJson('/api/v1/admin/products', $this->productPayload(['name' => 'নকশা ঝুমকা'], [['sku' => 'SP-3', 'price' => '100']]))->assertCreated()->json('data.slug');

        $this->assertMatchesRegularExpression('/^[a-z0-9-]+$/', $first);
        $this->assertNotSame($first, $second);
        $this->assertNotSame('', $bangla);
        $this->getJson("/api/v1/products/{$first}")->assertOk()->assertJsonPath('data.name', 'Jhumka & Co. — "Rose" <b>');
    }

    #[Test]
    public function p5_editing_a_product_after_an_order_keeps_the_order_snapshot(): void
    {
        $variant = $this->variant(price: '800.00', stock: 5, sku: 'SNAP-1');
        $product = $variant->product;
        $order = $this->webOrder($variant, 1);

        $this->actingAs($this->owner)->putJson("/api/v1/admin/products/{$product->id}", [
            'name' => 'Renamed Earring',
            'variants' => [['id' => $variant->id, 'sku' => 'SNAP-NEW', 'price' => '1500', 'raw_material_cost' => '999']],
        ])->assertOk();

        $item = $order->items()->first();
        $this->assertSame($product->getOriginal('name'), $item->product_name);
        $this->assertSame('SNAP-1', $item->sku);
        $this->assertSame('800.00', $item->unit_price);
        $this->assertSame('450.00', $item->unit_cost);
        $this->actingAs($this->owner)->getJson("/api/v1/admin/orders/{$order->id}")->assertJsonPath('data.items.0.product_name', $product->getOriginal('name'));
    }

    #[Test]
    public function p6_deleting_a_product_with_orders_archives_it_and_history_survives(): void
    {
        $sold = $this->variant(stock: 5);
        $order = $this->webOrder($sold, 1);
        $unsold = $this->variant(stock: 0);

        $this->actingAs($this->owner)->deleteJson("/api/v1/admin/products/{$sold->product_id}")->assertOk()->assertJsonPath('archived', true);
        $this->actingAs($this->owner)->deleteJson("/api/v1/admin/products/{$unsold->product_id}")->assertOk()->assertJsonPath('archived', false);

        $this->assertDatabaseHas('products', ['id' => $sold->product_id, 'status' => 'archived']);
        $this->assertDatabaseMissing('products', ['id' => $unsold->product_id]);
        $this->getJson("/api/v1/products/{$sold->product->slug}")->assertNotFound();
        $this->actingAs($this->owner)->getJson("/api/v1/admin/orders/{$order->id}")->assertOk();
        // archived stock can no longer be bought on the website or in New sale
        $this->postJson('/api/v1/checkout', $this->checkoutPayload($sold, 1))->assertUnprocessable();
    }

    #[Test]
    public function p7_staff_cannot_change_costs(): void
    {
        $variant = $this->variant(stock: 1);
        $this->actingAs($this->staff)->putJson("/api/v1/admin/products/{$variant->product_id}", [
            'variants' => [['id' => $variant->id, 'sku' => $variant->sku, 'price' => '1000', 'raw_material_cost' => '1']],
        ])->assertOk();

        $this->assertSame('300.00', $variant->refresh()->raw_material_cost);
    }

    #[Test]
    public function p8_admin_product_search_filter_and_pagination(): void
    {
        $this->actingAs($this->owner);
        foreach (range(1, 30) as $i) {
            $this->postJson('/api/v1/admin/products', $this->productPayload(['name' => "Bead Drop {$i}", 'status' => $i <= 5 ? 'draft' : 'active'], [['sku' => "PG-{$i}", 'price' => '100']]))->assertCreated();
        }

        $this->getJson('/api/v1/admin/products?per_page=25')->assertOk()->assertJsonCount(25, 'data')->assertJsonPath('meta.total', 30);
        $this->getJson('/api/v1/admin/products?per_page=25&page=2')->assertOk()->assertJsonCount(5, 'data');
        $this->getJson('/api/v1/admin/products?status=draft')->assertOk()->assertJsonPath('meta.total', 5);
        $this->getJson('/api/v1/admin/products?q=Drop%2012')->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/products?q=PG-7')->assertOk()->assertJsonPath('meta.total', 1);
    }

    #[Test]
    public function p9_image_upload_rejects_non_images_and_oversized_files(): void
    {
        $variant = $this->variant(stock: 1);
        $this->actingAs($this->owner);

        $this->post("/api/v1/admin/products/{$variant->product_id}/images", ['images' => [UploadedFile::fake()->create('evil.php', 10, 'application/x-php')]], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->post("/api/v1/admin/products/{$variant->product_id}/images", ['images' => [UploadedFile::fake()->image('huge.jpg', 800, 800)->size(20000)]], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->post("/api/v1/admin/products/{$variant->product_id}/images", ['images' => [UploadedFile::fake()->image('ok.jpg', 800, 800)]], ['Accept' => 'application/json'])->assertSuccessful();
    }

    // ───────────────────────── 2.3 Variants ─────────────────────────

    #[Test]
    public function v1_ordering_one_variant_never_touches_another(): void
    {
        $product = $this->dress();
        [$redS, $redM, $blackS, $blackM] = $product->variants->sortBy('sort_order')->values()->all();

        $order = $this->webOrder($redM, 2);
        $this->move($order, 'confirmed', 'delivered');

        $this->assertSame([10, 3, 8, 0], [$redS->refresh()->stock_on_hand, $redM->refresh()->stock_on_hand, $blackS->refresh()->stock_on_hand, $blackM->refresh()->stock_on_hand]);
        $this->assertSame('1200.00', $order->items()->first()->unit_price);
        $this->assertSame(1, InventoryMovement::query()->where('order_id', $order->id)->where('type', 'sale')->count());
        $this->assertSame(0, InventoryMovement::query()->whereIn('variant_id', [$redS->id, $blackS->id, $blackM->id])->where('order_id', $order->id)->count());
    }

    #[Test]
    public function v2_out_of_stock_variant_shows_sold_out_and_cannot_be_bought(): void
    {
        $product = $this->dress();
        $blackM = $product->variants->firstWhere('sku', 'DR-B-M');

        $variants = collect($this->getJson("/api/v1/products/{$product->slug}")->assertOk()->json('data.variants'));
        $this->assertSame('out_of_stock', $variants->firstWhere('sku', 'DR-B-M')['stock_status']);
        $this->assertSame(0, $variants->firstWhere('sku', 'DR-B-M')['max_quantity']);
        $this->assertSame('1300.00', $variants->firstWhere('sku', 'DR-B-S')['price']);

        $this->postJson('/api/v1/checkout', $this->checkoutPayload($blackM, 1))->assertConflict();
    }

    #[Test]
    public function v3_two_variants_with_the_same_options_are_rejected(): void
    {
        $this->actingAs($this->owner)->postJson('/api/v1/admin/products', $this->productPayload([], [
            ['sku' => 'TWIN-1', 'price' => '100', 'options' => ['Color' => 'Red', 'Size' => 'Small']],
            ['sku' => 'TWIN-2', 'price' => '100', 'options' => ['Color' => 'Red', 'Size' => 'Small']],
        ]))->assertUnprocessable();
    }

    #[Test]
    public function v4_removing_a_variant_with_history_deactivates_it_and_keeps_orders(): void
    {
        $product = $this->dress();
        $redM = $product->variants->firstWhere('sku', 'DR-R-M');
        $order = $this->webOrder($redM, 1);

        $keep = $product->variants->where('sku', '!=', 'DR-R-M')->map(fn (ProductVariant $v) => ['id' => $v->id, 'sku' => $v->sku, 'price' => $v->price, 'options' => $v->options])->values()->all();
        $this->actingAs($this->owner)->putJson("/api/v1/admin/products/{$product->id}", ['variants' => $keep])->assertOk();

        $this->assertFalse($redM->refresh()->is_active);
        $this->assertSame('DR-R-M', $order->items()->first()->sku);
        $this->postJson('/api/v1/checkout', $this->checkoutPayload($redM, 1))->assertUnprocessable();

        // the pending order still holds its reservation and can be cancelled cleanly
        $this->move($order, 'cancelled');
        $this->assertSame(0, $redM->refresh()->stock_reserved);
        $this->assertSame(5, $redM->stock_on_hand);
    }

    #[Test]
    public function v5_variant_limits_and_ownership(): void
    {
        $this->actingAs($this->owner);
        $fifty = array_map(fn ($i) => ['sku' => "MANY-{$i}", 'price' => '100', 'options' => ['Design' => "D{$i}"]], range(1, 50));
        $this->postJson('/api/v1/admin/products', $this->productPayload([], $fifty))->assertCreated();
        $fiftyOne = array_map(fn ($i) => ['sku' => "MORE-{$i}", 'price' => '100', 'options' => ['Design' => "D{$i}"]], range(1, 51));
        $this->postJson('/api/v1/admin/products', $this->productPayload([], $fiftyOne))->assertJsonValidationErrors('variants');

        $other = $this->variant(stock: 1);
        $mine = $this->variant(stock: 1);
        $this->putJson("/api/v1/admin/products/{$mine->product_id}", ['variants' => [['id' => $other->id, 'sku' => 'STEAL-1', 'price' => '1']]])
            ->assertJsonValidationErrors('variants.0.id');
    }

    #[Test]
    public function v6_admin_sale_picks_the_exact_variant_and_price(): void
    {
        $product = $this->dress();
        $blackS = $product->variants->firstWhere('sku', 'DR-B-S');

        $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', [
            'channel' => 'physical_store', 'status' => 'delivered',
            'items' => [['variant_id' => $blackS->id, 'quantity' => 3]],
            'payment' => ['method' => 'cash'],
        ])->assertCreated()->assertJsonPath('data.grand_total', '3900.00');

        $this->assertSame(5, $blackS->refresh()->stock_on_hand);
        $this->assertSame(10, $product->variants->firstWhere('sku', 'DR-R-S')->refresh()->stock_on_hand);
    }

    // ───────────────────────── 2.4 Categories ─────────────────────────

    #[Test]
    public function c1_category_delete_rules(): void
    {
        $this->actingAs($this->owner);
        $this->variant(stock: 1); // product in $this->category
        $this->deleteJson("/api/v1/admin/categories/{$this->category->id}")->assertStatus(409);

        $parent = Category::factory()->create();
        $child = Category::factory()->create(['parent_id' => $parent->id]);
        $this->deleteJson("/api/v1/admin/categories/{$parent->id}")->assertOk();
        $this->assertNull($child->refresh()->parent_id);
    }

    #[Test]
    public function c2_category_parent_and_name_rules(): void
    {
        $this->actingAs($this->owner);
        $a = $this->postJson('/api/v1/admin/categories', ['name' => 'Earrings'])->assertCreated()->json('data');
        $b = $this->postJson('/api/v1/admin/categories', ['name' => 'Earrings'])->assertCreated()->json('data');
        $this->assertNotSame($a['slug'], $b['slug']);

        $child = $this->postJson('/api/v1/admin/categories', ['name' => 'Studs', 'parent_id' => $a['id']])->assertCreated()->json('data');
        $this->postJson('/api/v1/admin/categories', ['name' => 'Deep', 'parent_id' => $child['id']])->assertJsonValidationErrors('parent_id');
        $this->patchJson("/api/v1/admin/categories/{$a['id']}", ['parent_id' => $a['id']])->assertJsonValidationErrors('parent_id');
        $this->postJson('/api/v1/admin/categories', ['name' => 'X', 'slug' => $a['slug']])->assertJsonValidationErrors('slug');
    }

    #[Test]
    public function c3_hidden_category_leaves_the_shop(): void
    {
        $this->variant(stock: 1);
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/categories/{$this->category->id}", ['is_active' => false])->assertOk();

        $this->assertNotContains($this->category->slug, array_column($this->getJson('/api/v1/categories')->assertOk()->json('data'), 'slug'));
        $this->getJson("/api/v1/categories/{$this->category->slug}")->assertNotFound();
    }

    // ───────────────────────── 2.5 Inventory ─────────────────────────

    #[Test]
    public function i1_the_eight_step_stock_scenario(): void
    {
        $variant = $this->apiProduct(sku: 'INV-100', stock: 100);
        $state = fn () => [$variant->refresh()->stock_on_hand, $variant->stock_reserved, $variant->availableStock()];

        $this->assertSame([100, 0, 100], $state(), '1. opening stock 100');

        $first = $this->webOrder($variant, 5);
        $this->assertSame([100, 5, 95], $state(), '2. customer orders 5 → reserved');

        $this->move($first, 'confirmed');
        $this->assertSame([100, 5, 95], $state(), '3. confirmed → still reserved');

        $this->move($first, 'cancelled');
        $this->assertSame([100, 0, 100], $state(), '4. cancelled → reservation released');

        $delivered = $this->webOrder($variant, 5);
        $this->move($delivered, 'confirmed', 'delivered');
        $this->assertSame([95, 0, 95], $state(), '5a. a delivered order of 5 leaves the shop');
        $item = $delivered->items()->first();
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$delivered->id}/returns", ['items' => [['order_item_id' => $item->id, 'quantity' => 2]]])->assertOk();
        $this->assertSame([97, 0, 97], $state(), '5b. customer returns 2 in good condition');

        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$delivered->id}/refunds", ['amount' => '100', 'method' => 'cash'])->assertCreated();
        $this->assertSame([97, 0, 97], $state(), '6. a refund alone never moves stock');

        $this->actingAs($this->owner)->postJson('/api/v1/admin/inventory/adjust', ['variant_id' => $variant->id, 'type' => 'adjustment_out', 'quantity' => 3, 'reason' => 'Recount'])->assertOk();
        $this->assertSame([94, 0, 94], $state(), '7. manual adjustment −3');

        $this->webOrder($variant, 10);
        $this->assertSame([94, 10, 84], $state(), '8. another customer orders 10');

        $this->assertLedgerMatches($variant);
    }

    #[Test]
    public function i2_ordering_more_than_stock_or_bad_quantities_fails_cleanly(): void
    {
        $variant = $this->variant(stock: 3);

        $this->postJson('/api/v1/checkout', $this->checkoutPayload($variant, 4))->assertConflict();
        $this->postJson('/api/v1/checkout', $this->checkoutPayload($variant, 0))->assertUnprocessable();
        $this->postJson('/api/v1/checkout', $this->checkoutPayload($variant, -2))->assertUnprocessable();
        $this->assertSame([3, 0], [$variant->refresh()->stock_on_hand, $variant->stock_reserved]);
        $this->assertSame(0, Order::query()->count());
    }

    #[Test]
    public function i3_last_unit_goes_to_the_first_customer_only(): void
    {
        $variant = $this->variant(stock: 1);

        $this->postJson('/api/v1/checkout', $this->checkoutPayload($variant, 1))->assertCreated();
        $this->postJson('/api/v1/checkout', $this->checkoutPayload($variant, 1))->assertConflict();
        $this->actingAs($this->staff)->postJson('/api/v1/admin/manual-sales', [
            'channel' => 'physical_store', 'status' => 'delivered', 'items' => [['variant_id' => $variant->id, 'quantity' => 1]], 'payment' => ['method' => 'cash'],
        ])->assertConflict();

        $this->assertSame([1, 1, 0], [$variant->refresh()->stock_on_hand, $variant->stock_reserved, $variant->availableStock()]);
    }

    #[Test]
    public function i4_manual_adjustments_guard_reserved_stock_and_need_a_reason(): void
    {
        $variant = $this->variant(stock: 5);
        $this->webOrder($variant, 4);
        $this->actingAs($this->staff);

        $this->postJson('/api/v1/admin/inventory/adjust', ['variant_id' => $variant->id, 'type' => 'adjustment_out', 'quantity' => 2, 'reason' => 'Broken'])->assertUnprocessable();
        $this->postJson('/api/v1/admin/inventory/adjust', ['variant_id' => $variant->id, 'type' => 'purchase', 'quantity' => 10])->assertJsonValidationErrors('reason');
        $this->postJson('/api/v1/admin/inventory/adjust', ['variant_id' => $variant->id, 'type' => 'sale', 'quantity' => 1, 'reason' => 'Sneaky'])->assertJsonValidationErrors('type');
        $this->postJson('/api/v1/admin/inventory/adjust', ['variant_id' => $variant->id, 'type' => 'purchase', 'quantity' => 10, 'reason' => 'New batch'])->assertOk();

        $this->assertSame([15, 4, 11], [$variant->refresh()->stock_on_hand, $variant->stock_reserved, $variant->availableStock()]);
        $this->assertLedgerMatches($variant);
    }

    #[Test]
    public function i5_damaged_returns_are_not_restocked_but_cost_money(): void
    {
        $variant = $this->variant(price: '1000.00', stock: 10);
        $order = $this->webOrder($variant, 3);
        $this->move($order, 'confirmed', 'delivered');
        $item = $order->items()->first();

        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$order->id}/returns", ['items' => [['order_item_id' => $item->id, 'quantity' => 2, 'damaged' => 1]]])->assertOk();

        $this->assertSame(8, $variant->refresh()->stock_on_hand, '7 after sale + 1 good unit back');
        $this->assertSame(1, InventoryMovement::query()->where('order_id', $order->id)->where('type', 'return_damaged')->count());
        $report = app(ReportService::class)->summary(CarbonImmutable::today(), CarbonImmutable::today())['realized'];
        $this->assertSame('1000.00', $report['product_revenue'], 'kept 1 of 3');
        $this->assertSame('900.00', $report['cogs'], '1 kept + 1 damaged × 450');
        $this->assertLedgerMatches($variant);
    }

    #[Test]
    public function i6_double_cancel_and_double_ship_do_not_move_stock_twice(): void
    {
        $variant = $this->variant(stock: 5);
        $cancelled = $this->webOrder($variant, 2);
        $this->move($cancelled, 'cancelled');
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$cancelled->id}/status", ['status' => 'cancelled'])->assertStatus(409);

        $shipped = $this->webOrder($variant, 2);
        $this->move($shipped, 'confirmed', 'shipped');
        $this->actingAs($this->owner)->postJson("/api/v1/admin/orders/{$shipped->id}/status", ['status' => 'shipped'])->assertStatus(409);

        $this->assertSame([3, 0], [$variant->refresh()->stock_on_hand, $variant->stock_reserved]);
        $this->assertLedgerMatches($variant);
    }

    #[Test]
    public function i7_observation_return_by_status_button_restocks_every_unit_as_sellable(): void
    {
        $variant = $this->variant(stock: 5);
        $order = $this->webOrder($variant, 2);
        $this->move($order, 'confirmed', 'delivered', 'returned');

        $this->assertSame(5, $variant->refresh()->stock_on_hand);
        $this->assertSame(0, InventoryMovement::query()->where('order_id', $order->id)->where('type', 'return_damaged')->count());
    }

    #[Test]
    public function i8_low_stock_list_uses_each_variants_own_threshold(): void
    {
        $default = $this->variant(stock: 3);               // store threshold 3 → low
        $custom = $this->variant(stock: 8);
        $custom->update(['low_stock_threshold' => 10]);    // own threshold 10 → low
        $this->variant(stock: 20);                         // fine

        $ids = array_column($this->actingAs($this->owner)->getJson('/api/v1/admin/dashboard')->json('data.low_stock'), 'id');
        sort($ids);
        $this->assertSame([$default->id, $custom->id], $ids);
    }

    #[Test]
    public function i9_risk_double_submitted_checkout_creates_two_orders(): void
    {
        // No idempotency key: two identical submissions (double tap, retry after a timeout) = two orders.
        $variant = $this->variant(stock: 5);
        $payload = $this->checkoutPayload($variant, 1);

        $this->postJson('/api/v1/checkout', $payload)->assertCreated();
        $this->postJson('/api/v1/checkout', $payload)->assertCreated();

        $this->assertSame(2, Order::query()->count());
    }

    #[Test]
    public function i10_made_to_order_variant_can_go_below_zero_and_the_ledger_still_adds_up(): void
    {
        $variant = ProductVariant::factory()->for(Product::factory()->for($this->category))->backorderable()->withStock(1)->create(['is_default' => true]);

        $order = $this->webOrder($variant, 3);
        $this->move($order, 'confirmed', 'delivered');

        $this->assertSame(-2, $variant->refresh()->stock_on_hand);
        $this->assertSame(0, $variant->stock_reserved);
    }

    // ───────────────────────── helpers ─────────────────────────

    /** Every variant's stored stock must equal the sum of its ledger rows (opening stock set outside the ledger counted once). */
    private function assertLedgerMatches(ProductVariant $variant): void
    {
        $variant->refresh();
        $onHand = (int) InventoryMovement::query()->where('variant_id', $variant->id)->sum('on_hand_delta');
        $reserved = (int) InventoryMovement::query()->where('variant_id', $variant->id)->sum('reserved_delta');
        $opening = $this->openingOutsideLedger[$variant->id] ?? 0;

        $this->assertSame($variant->stock_on_hand, $opening + $onHand, "on-hand ledger for {$variant->sku}");
        $this->assertSame($variant->stock_reserved, $reserved, "reserved ledger for {$variant->sku}");
        $this->assertGreaterThanOrEqual(0, $variant->stock_reserved);
    }

    /** @var array<int, int> stock given by factories (not through the ledger) */
    private array $openingOutsideLedger = [];

    private function variant(string $price = '1000.00', int $stock = 10, ?string $sku = null): ProductVariant
    {
        $variant = ProductVariant::factory()
            ->for(Product::factory()->for($this->category))
            ->withStock($stock)
            ->create(array_filter(['price' => $price, 'is_default' => true, 'sku' => $sku]));
        $this->openingOutsideLedger[$variant->id] = $stock;

        return $variant->load('product');
    }

    /** Product created through the admin API so opening stock goes through the ledger. */
    private function apiProduct(string $sku, int $stock): ProductVariant
    {
        $id = $this->actingAs($this->owner)->postJson('/api/v1/admin/products', $this->productPayload([], [[
            'sku' => $sku, 'price' => '500', 'raw_material_cost' => '200', 'initial_stock' => $stock,
        ]]))->assertCreated()->json('data.variants.0.id');

        return ProductVariant::query()->findOrFail($id);
    }

    /** The brief's example dress: 4 variants with their own SKU, price and stock. */
    private function dress(): Product
    {
        $rows = [
            ['DR-R-S', 'Red', 'Small', 10, '1200'],
            ['DR-R-M', 'Red', 'Medium', 5, '1200'],
            ['DR-B-S', 'Black', 'Small', 8, '1300'],
            ['DR-B-M', 'Black', 'Medium', 0, '1300'],
        ];
        $id = $this->actingAs($this->owner)->postJson('/api/v1/admin/products', $this->productPayload(['name' => "Women's Dress"], array_map(fn ($r, $i) => [
            'sku' => $r[0], 'title' => "{$r[1]} / {$r[2]}", 'options' => ['Color' => $r[1], 'Size' => $r[2]],
            'price' => $r[4], 'raw_material_cost' => '500', 'initial_stock' => $r[3], 'sort_order' => $i,
        ], $rows, array_keys($rows))))->assertCreated()->json('data.id');

        return Product::query()->with('variants')->findOrFail($id);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @param  list<array<string, mixed>>|null  $variants
     * @return array<string, mixed>
     */
    private function productPayload(array $overrides = [], ?array $variants = null): array
    {
        return array_merge([
            'category_id' => $this->category->id,
            'name' => 'QA Earring '.uniqid(),
            'status' => 'active',
            'variants' => $variants ?? [['sku' => 'QA-'.uniqid(), 'price' => '100']],
        ], $overrides);
    }

    private function webOrder(ProductVariant $variant, int $quantity): Order
    {
        return app(OrderService::class)->placeWebsiteOrder($this->checkoutPayload($variant, $quantity));
    }

    /** @return array<string, mixed> */
    private function checkoutPayload(ProductVariant $variant, int $quantity): array
    {
        $this->phoneSeq++;

        return [
            'customer' => ['name' => "QA Customer {$this->phoneSeq}", 'phone' => '0171'.str_pad((string) $this->phoneSeq, 7, '0', STR_PAD_LEFT)],
            'shipping' => ['address' => 'House 1, Road 2', 'area' => 'Mirpur', 'city' => 'Dhaka', 'delivery_zone_id' => $this->zone->id],
            'items' => [['variant_id' => $variant->id, 'quantity' => $quantity]],
            'payment' => ['method' => 'cod'],
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
