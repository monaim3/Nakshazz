<?php

namespace Database\Factories;

use App\Models\Expense;
use App\Models\ExpenseCategory;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Expense>
 */
class ExpenseFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'expense_category_id' => fn () => ExpenseCategory::query()->firstOrCreate(
                ['slug' => 'marketing'],
                ['name' => 'Marketing'],
            )->id,
            'title' => fake()->words(3, true),
            'amount' => '500.00',
            'expense_date' => now()->toDateString(),
        ];
    }
}
