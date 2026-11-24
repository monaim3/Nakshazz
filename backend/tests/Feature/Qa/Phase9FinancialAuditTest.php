<?php

namespace Tests\Feature\Qa;

use App\Models\Coupon;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use App\Models\User;
use App\Services\PaymentService;
use App\Services\ReportService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * QA audit, phase 9: financial audit of reports against an independently calculated month.
 *
 * The app's accounting definitions (ReportService), which this test checks:
 *  - Realized = delivered or returned orders, dated by delivery (return date only if never delivered).
 *  - Product revenue = line total after discounts × units kept ÷ units sold.
 *  - COGS = unit cost × (units kept + units returned damaged), from the order's cost snapshot.
 *  - Delivery income = delivery charge of delivered orders; delivery cost = courier cost entered.
 *  - Net profit = revenue − COGS + delivery income − delivery cost − payment fees − goodwill refunds − expenses (by expense date).
 *  - Estimated = open orders (pending → shipped) by the day they were placed.
 *
 * Products: A ৳1,000 (cost 450), B ৳600 (cost 250), C ৳1,500 (cost 700). Delivery inside ৳70, outside ৳130.
 * Every expected figure below is worked out by hand from the scenario, not read from the database.
 */
#[Group('qa')]
class Phase9FinancialAuditTest extends TestCase
{
    use BuildsNovember;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpNovember();
    }

    #[Test]
    public function f1_november_reports_match_the_hand_calculation(): void
    {
        $this->runNovember();
        $reports = app(ReportService::class);
        $nov = $reports->summary(CarbonImmutable::parse('2026-11-01'), CarbonImmutable::parse('2026-11-30'));

        $expected = [
            'orders' => 8,                    // O1 O2 O3 O4 O6 O7 O8 O12
            'product_revenue' => '10280.00',  // 2000 + 600 + 1400 + 1980 + 1000 + 1200 + 1500 + 600
            'discounts' => '320.00',          // O3 manual 100 + O4 coupon 220
            'cogs' => '5150.00',              // 900 + 250 + 700 + 950 + 900 (1 kept + 1 damaged) + 500 + 700 + 250
            'gross_profit' => '5130.00',
            'delivery_income' => '670.00',    // 70 + 130 + 0 + 70 + 70 + 130 + 130 + 70
            'delivery_cost' => '510.00',      // 60 + 110 + 60 + 60 + 110 + 110
            'delivery_net' => '160.00',
            'payment_fees' => '99.00',        // 20 + 9 + 15 + 25 + 30
            'compensation' => '200.00',       // O8 goodwill
            'operating_expenses' => '4700.00', // 500 + 1200 + 3000 (Oct 31 and Dec 1 excluded)
            'net_profit' => '291.00',         // 5130 + 670 − 510 − 99 − 200 − 4700
        ];
        foreach ($expected as $key => $value) {
            $this->assertSame($value, $nov['realized'][$key], "November {$key}");
        }

        // open orders placed in November: O9 confirmed A, O10 pending B, O11 shipped A
        $this->assertSame(['orders' => 3, 'product_revenue' => '2600.00', 'cogs' => '1150.00', 'gross_profit' => '1450.00'], $nov['estimated']);

        // the 23:58 order delivered at 00:05 on 1 December belongs to December
        $dec = $reports->summary(CarbonImmutable::parse('2026-12-01'), CarbonImmutable::parse('2026-12-31'))['realized'];
        $this->assertSame([1, '1000.00', '450.00', '70.00', '300.00', '320.00'], [$dec['orders'], $dec['product_revenue'], $dec['cogs'], $dec['delivery_income'], $dec['operating_expenses'], $dec['net_profit']]);
    }

    #[Test]
    public function f2_breakdowns_add_up_to_the_total_with_no_double_counting(): void
    {
        $this->runNovember();
        $reports = app(ReportService::class);
        [$from, $to] = [CarbonImmutable::parse('2026-11-01'), CarbonImmutable::parse('2026-11-30')];

        $channels = collect($reports->byChannel($from, $to))->keyBy('channel');
        $this->assertSame('7680.00', $channels['website']['product_revenue'], 'website: O1 O2 O4 O6 O8 O12');
        $this->assertSame('1400.00', $channels['physical_store']['product_revenue'], 'O3');
        $this->assertSame('1200.00', $channels['facebook']['product_revenue'], 'O7');
        $this->assertSame(8, $channels->sum('orders'));

        $products = collect($reports->byProduct($from, $to));
        $this->assertSame('10280.00', number_format($products->sum(fn ($p) => (float) $p['product_revenue']), 2, '.', ''));
        $this->assertSame('5150.00', number_format($products->sum(fn ($p) => (float) $p['cogs']), 2, '.', ''));
        $units = $products->mapWithKeys(fn ($p) => [$p['product_id'] => $p['units_sold']]);
        $this->assertSame([4, 6, 2], [$units[$this->v['A']->product_id], $units[$this->v['B']->product_id], $units[$this->v['C']->product_id]]);

        $months = collect($reports->monthly(CarbonImmutable::parse('2026-10-01'), CarbonImmutable::parse('2026-12-31')))->keyBy('month');
        $this->assertSame(['2026-10', '2026-11', '2026-12'], $months->keys()->all());
        $this->assertSame('-2000.00', $months['2026-10']['net_profit'], 'October: only the ৳2,000 expense');
        $this->assertSame('291.00', $months['2026-11']['net_profit']);
        $this->assertSame('320.00', $months['2026-12']['net_profit']);
        $quarter = $reports->summary(CarbonImmutable::parse('2026-10-01'), CarbonImmutable::parse('2026-12-31'))['realized'];
        $this->assertSame('-1389.00', $quarter['net_profit'], 'quarter = sum of its months: −2000 + 291 + 320');
    }

    #[Test]
    public function f3_dashboard_for_november_agrees_with_the_report(): void
    {
        $this->runNovember();
        $this->travelTo(CarbonImmutable::parse('2026-12-02 10:00', 'Asia/Dhaka'));
        $cards = $this->actingAs($this->owner)->getJson('/api/v1/admin/dashboard?from=2026-11-01&to=2026-11-30')->assertOk()->json('data.cards');

        $this->assertSame('10280.00', $cards['total_revenue']);
        $this->assertSame(8, $cards['completed_orders']);
        $this->assertSame(11, $cards['total_orders'], '8 realized + 3 open');
        $this->assertSame('291.00', $cards['net_profit']);
        $this->assertSame('2600.00', $cards['manual_sales'], 'O3 1400 + O7 1200 (no returns among manual sales)');
        // FIXED BUG-001: the website card uses the report formula, so O6's returned pieces come off
        $this->assertSame('7680.00', $cards['website_sales']);
    }

    #[Test]
    public function f4_money_actually_collected_is_not_reported_anywhere(): void
    {
        $this->runNovember();
        $paid = fn (string $type) => number_format((float) Payment::query()->where('type', $type)->where('status', 'verified')->whereBetween('paid_at', ['2026-11-01 00:00:00', '2026-11-30 23:59:59'])->sum('amount'), 2, '.', '');

        // independent: O1 2070 + O2 730 + O3 1400 + O4 2050 + O6 3070 + O7 300 + 1030 + O8 1630 + O12 670
        $this->assertSame('12950.00', $paid('payment'));
        $this->assertSame('2200.00', $paid('refund'), 'O6 2000 + O8 200');
        // still owed on open orders: O9 1070 + O11 1070 (COD, not delivered) + O10 670 (bKash not checked)
        $owed = Order::query()->whereIn('status', ['pending', 'confirmed', 'processing', 'shipped'])->get()->sum(fn (Order $o) => (float) app(PaymentService::class)->amountDue($o));
        $this->assertSame(2810.0, $owed);

        $keys = array_keys(app(ReportService::class)->summary(CarbonImmutable::parse('2026-11-01'), CarbonImmutable::parse('2026-11-30'))['realized']);
        $this->assertEmpty(array_intersect($keys, ['collected', 'cash_received', 'receivables', 'outstanding']), 'GAP: no collected / owed figures in reports');
    }

    #[Test]
    public function f5_expenses_rules_and_their_effect_on_profit(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-20 12:00', 'Asia/Dhaka'));
        $category = ExpenseCategory::query()->firstOrCreate(['slug' => 'packaging'], ['name' => 'Packaging']);
        $this->actingAs($this->owner);
        $save = fn (array $data) => $this->postJson('/api/v1/admin/expenses', array_merge(['expense_category_id' => $category->id, 'title' => 'QA'], $data));

        $save(['amount' => '0', 'expense_date' => '2026-11-10'])->assertJsonValidationErrors('amount');
        $save(['amount' => '-50', 'expense_date' => '2026-11-10'])->assertJsonValidationErrors('amount');
        $save(['amount' => '100', 'expense_date' => '2026-11-21'])->assertJsonValidationErrors('expense_date');
        $id = $save(['amount' => '400', 'expense_date' => '2026-10-15'])->assertCreated()->json('data.id');
        $save(['amount' => '250', 'expense_date' => '2026-11-20'])->assertCreated();
        // FIXED (my call 13): an exact duplicate asks first, and is saved only when confirmed
        $save(['amount' => '250', 'expense_date' => '2026-11-20'])->assertJsonValidationErrors('duplicate');
        $save(['amount' => '250', 'expense_date' => '2026-11-20', 'confirm_duplicate' => true])->assertCreated();

        $reports = app(ReportService::class);
        $month = fn (string $m) => $reports->summary(CarbonImmutable::parse("{$m}-01"), CarbonImmutable::parse("{$m}-01")->endOfMonth())['realized']['operating_expenses'];
        $this->assertSame(['400.00', '500.00'], [$month('2026-10'), $month('2026-11')]);

        // moving last month's bill into this month changes both months
        $this->postJson("/api/v1/admin/expenses/{$id}", ['expense_category_id' => $category->id, 'amount' => '400', 'expense_date' => '2026-11-01', 'title' => 'QA'])->assertOk();
        $this->assertSame(['0.00', '900.00'], [$month('2026-10'), $month('2026-11')]);

        $this->getJson('/api/v1/admin/expenses?from=2026-11-01&to=2026-11-30')->assertOk()->assertJsonPath('meta.total', 3);
    }

    #[Test]
    public function f6_midnight_and_leap_day_boundaries(): void
    {
        $at = fn (string $when) => $this->travelTo(CarbonImmutable::parse($when, 'Asia/Dhaka'));
        $at('2028-02-29 23:59:30');
        $leap = $this->web('A', 1, 'cod', $this->inside);
        $this->to($leap, ['confirmed', 'delivered']);
        $at('2028-03-01 00:00:00');
        $march = $this->web('A', 1, 'cod', $this->inside);
        $this->to($march, ['confirmed', 'delivered']);

        $reports = app(ReportService::class);
        $this->assertSame(1, $reports->summary(CarbonImmutable::parse('2028-02-29'), CarbonImmutable::parse('2028-02-29'))['realized']['orders'], '23:59:30 on 29 Feb stays on 29 Feb');
        $this->assertSame(1, $reports->summary(CarbonImmutable::parse('2028-03-01'), CarbonImmutable::parse('2028-03-01'))['realized']['orders'], '00:00:00 on 1 Mar is 1 Mar');
        $months = collect($reports->monthly(CarbonImmutable::parse('2028-02-01'), CarbonImmutable::parse('2028-03-31')))->keyBy('month');
        $this->assertSame([1, 1], [$months['2028-02']['orders'], $months['2028-03']['orders']]);

        // dashboard default "last 30 days" = today and the 29 days before it
        $at('2028-03-30 09:00:00');
        $range = $this->actingAs($this->owner)->getJson('/api/v1/admin/dashboard')->json('data.range');
        $this->assertSame(['from' => '2028-03-01', 'to' => '2028-03-30'], $range);
    }

    #[Test]
    public function f7_only_the_owner_sees_money_reports(): void
    {
        $staff = User::factory()->create();
        foreach (['reports/summary', 'reports/channels', 'reports/products', 'reports/monthly', 'expenses'] as $path) {
            $this->actingAs($staff)->getJson("/api/v1/admin/{$path}")->assertForbidden();
        }
        $this->actingAs($this->owner)->getJson('/api/v1/admin/reports/summary?from=2020-01-01&to=2026-11-30')->assertStatus(422);
    }
}
