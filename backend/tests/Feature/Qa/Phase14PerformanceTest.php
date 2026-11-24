<?php

namespace Tests\Feature\Qa;

use App\Enums\OrderStatus;
use App\Models\Category;
use App\Models\DeliveryZone;
use App\Models\Expense;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\OrderService;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * QA audit, phase 14: performance with a realistic amount of data, and real row locking.
 * Builds 120 products × 3 variants (360), ~1,000 orders with customers and payments.
 * Timings are on the developer PC (MariaDB, php artisan); they are for comparison, not SLAs.
 */
#[Group('qa')]
class Phase14PerformanceTest extends TestCase
{
    use RefreshDatabase;

    private const ORDERS = 1000;

    private User $owner;

    /** @var array<string, array{ms: int, queries: int}> */
    private static array $results = [];

    #[Test]
    public function q1_lists_reports_and_shop_stay_fast_and_query_counts_do_not_grow_with_page_size(): void
    {
        $this->buildData();

        $owner = [
            'admin orders' => '/api/v1/admin/orders?per_page=%d',
            'admin products' => '/api/v1/admin/products?per_page=%d',
            'admin inventory' => '/api/v1/admin/inventory?per_page=%d',
            'admin customers' => '/api/v1/admin/customers?per_page=%d',
            'admin expenses' => '/api/v1/admin/expenses?per_page=%d',
        ];
        foreach ($owner as $name => $url) {
            [$small] = $this->measure($name.' ×10', sprintf($url, 10), true);
            [$large, $ms] = $this->measure($name.' ×100', sprintf($url, 100), true);
            $this->assertSame($small, $large, "{$name}: same number of queries for 10 and 100 rows (no per-row queries)");
            $this->assertLessThan(3000, $ms, $name);
        }

        foreach ([
            'admin order detail' => '/api/v1/admin/orders/'.DB::table('orders')->max('id'),
            'admin customer detail' => '/api/v1/admin/customers/'.DB::table('customers')->orderByDesc('id')->value('id'),
            'dashboard 30 days' => '/api/v1/admin/dashboard',
            'dashboard 365 days' => '/api/v1/admin/dashboard?from='.now()->subDays(364)->toDateString(),
            'alerts' => '/api/v1/admin/alerts',
            'report summary year' => '/api/v1/admin/reports/summary?from='.now()->subDays(364)->toDateString(),
            'report channels' => '/api/v1/admin/reports/channels?from='.now()->subDays(364)->toDateString(),
            'report products' => '/api/v1/admin/reports/products?from='.now()->subDays(364)->toDateString(),
            'report monthly' => '/api/v1/admin/reports/monthly',
        ] as $name => $url) {
            [, $ms] = $this->measure($name, $url, true);
            $this->assertLessThan(3000, $ms, $name);
        }

        [$shopSmall] = $this->measure('shop list ×12', '/api/v1/products?per_page=12', false);
        [$shopLarge] = $this->measure('shop list ×48', '/api/v1/products?per_page=48', false);
        $this->assertSame($shopSmall, $shopLarge, 'shop list: no per-product queries');
        foreach ([
            'shop search' => '/api/v1/products?q=drop&per_page=48',
            'shop facets' => '/api/v1/products/facets',
            'shop home' => '/api/v1/home',
            'shop product' => '/api/v1/products/'.Product::query()->value('slug'),
            'shop categories' => '/api/v1/categories',
            'sitemap' => '/api/v1/sitemap',
        ] as $name => $url) {
            [, $ms] = $this->measure($name, $url, false);
            $this->assertLessThan(2000, $ms, $name);
        }

        $lines = array_map(fn ($k, $v) => sprintf('%-28s %5d ms %4d queries', $k, $v['ms'], $v['queries']), array_keys(self::$results), self::$results);
        fwrite(STDERR, "\nQA-PERF\n".implode("\n", $lines)."\n");
    }

    #[Test]
    public function q2_a_stock_row_locked_by_one_order_makes_a_second_order_wait(): void
    {
        // a second, independent connection to the same database (like a second web request)
        config(['database.connections.qa_second' => config('database.connections.'.config('database.default'))]);
        $second = DB::connection('qa_second');

        // committed data the second connection can see (the test's own transaction would hide it)
        $categoryId = $second->table('categories')->insertGetId(['name' => 'Lock QA', 'slug' => 'lock-qa-'.uniqid(), 'is_active' => 1, 'sort_order' => 0, 'created_at' => now(), 'updated_at' => now()]);
        $productId = $second->table('products')->insertGetId(['category_id' => $categoryId, 'name' => 'Lock QA', 'slug' => 'lock-qa-'.uniqid(), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $variantId = $second->table('product_variants')->insertGetId(['product_id' => $productId, 'sku' => 'LOCK-QA-'.uniqid(), 'title' => 'Default', 'price' => 1000, 'stock_on_hand' => 1, 'stock_reserved' => 0, 'is_default' => 1, 'is_active' => 1, 'created_at' => now(), 'updated_at' => now()]);

        try {
            // request 1 is placing an order: it holds the row lock inside its transaction
            DB::table('product_variants')->where('id', $variantId)->lockForUpdate()->first();

            // request 2 tries the same row and must wait; with a 1-second limit it gives up
            $second->statement('SET SESSION innodb_lock_wait_timeout = 1');
            $started = microtime(true);
            $blocked = false;
            try {
                $second->transaction(fn () => $second->table('product_variants')->where('id', $variantId)->lockForUpdate()->first());
            } catch (QueryException $e) {
                $blocked = str_contains($e->getMessage(), 'Lock wait timeout');
            }
            $this->assertTrue($blocked, 'second request waited for the lock instead of reading stale stock');
            $this->assertGreaterThanOrEqual(0.9, microtime(true) - $started);
        } finally {
            DB::rollBack();   // release request 1's lock
            DB::beginTransaction();
            $second->table('product_variants')->where('id', $variantId)->delete();
            $second->table('products')->where('id', $productId)->delete();
            $second->table('categories')->where('id', $categoryId)->delete();
            DB::purge('qa_second');
        }
    }

    // ───────────── helpers ─────────────

    /** @return array{0: int, 1: int} queries, ms */
    private function measure(string $name, string $url, bool $asOwner): array
    {
        $this->app['auth']->forgetGuards();
        $request = $asOwner ? $this->actingAs($this->owner) : $this;
        DB::flushQueryLog();
        DB::enableQueryLog();
        $start = microtime(true);
        $request->getJson($url)->assertOk();
        $ms = (int) round((microtime(true) - $start) * 1000);
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();
        self::$results[$name] = ['ms' => $ms, 'queries' => $queries];

        return [$queries, $ms];
    }

    private function buildData(): void
    {
        $this->seed(StoreSettingSeeder::class);
        $this->owner = User::factory()->owner()->create();
        $zone = DeliveryZone::factory()->create(['charge' => '70.00']);
        $categories = Category::factory()->count(6)->create();
        $variants = collect();
        foreach (range(1, 120) as $i) {
            $product = Product::factory()->for($categories[$i % 6])->create(['name' => ($i % 3 ? 'Bead' : 'Clay')." Drop {$i}"]);
            ProductImage::query()->create(['product_id' => $product->id, 'path' => "products/{$product->id}/img.webp", 'width' => 1280, 'height' => 1280, 'sort_order' => 0, 'is_primary' => true]);
            foreach (['Golden', 'Silver', 'Rose'] as $j => $colour) {
                $variants->push(ProductVariant::factory()->for($product)->withStock(500)->create(['title' => $colour, 'options' => ['Color' => $colour], 'price' => (string) (300 + 10 * ($i % 50)), 'is_default' => $j === 0]));
            }
        }

        $orders = app(OrderService::class);
        $statuses = [OrderStatus::Delivered, OrderStatus::Delivered, OrderStatus::Delivered, OrderStatus::Cancelled, OrderStatus::Confirmed];
        $start = now()->subDays(300);
        foreach (range(1, self::ORDERS) as $n) {
            $this->travelTo($start->copy()->addHours($n * 7));
            $order = $orders->placeWebsiteOrder([
                'customer' => ['name' => "Perf {$n}", 'phone' => '017'.str_pad((string) ($n % 400), 8, '0', STR_PAD_LEFT)],
                'shipping' => ['address' => 'House 1, Road 2', 'city' => 'Dhaka', 'delivery_zone_id' => $zone->id],
                'items' => [['variant_id' => $variants[$n % 360]->id, 'quantity' => 1], ['variant_id' => $variants[($n * 7) % 360]->id, 'quantity' => 2]],
                'payment' => ['method' => 'cod'],
            ]);
            $target = $statuses[$n % 5];
            if ($target !== OrderStatus::Cancelled) {
                $orders->transition($order, OrderStatus::Confirmed);
            }
            if ($target === OrderStatus::Delivered) {
                $orders->transition($order, OrderStatus::Delivered);
            } elseif ($target === OrderStatus::Cancelled) {
                $orders->transition($order, OrderStatus::Cancelled);
            }
        }
        $this->travelBack();
        Expense::factory()->count(60)->create();
    }
}
