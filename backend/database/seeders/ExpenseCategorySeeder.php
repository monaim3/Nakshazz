<?php

namespace Database\Seeders;

use App\Models\ExpenseCategory;
use Illuminate\Database\Seeder;

class ExpenseCategorySeeder extends Seeder
{
    /**
     * Hints are shown on the expense form to stop costs being counted twice.
     */
    public function run(): void
    {
        $categories = [
            'marketing' => ['Marketing', 'Facebook/Instagram ads, influencer payments, photoshoots.'],
            'packaging' => ['Packaging (bulk)', 'Only bulk packaging not already included in each product\'s packaging cost.'],
            'delivery' => ['Delivery (non-order)', 'Per-order courier charges go on the order itself, not here. Use this only for monthly courier fees etc.'],
            'utilities' => ['Utilities', 'Electricity, internet, phone bills.'],
            'rent' => ['Rent', null],
            'salary' => ['Salary', 'Fixed salaries. Per-piece labour belongs in product labour cost.'],
            'tools-equipment' => ['Tools & Equipment', null],
            'other' => ['Other', null],
        ];

        foreach ($categories as $slug => [$name, $hint]) {
            ExpenseCategory::query()->firstOrCreate(['slug' => $slug], ['name' => $name, 'hint' => $hint]);
        }
    }
}
