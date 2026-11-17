<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed data every environment needs. Safe to run more than once.
     */
    public function run(): void
    {
        $this->call([
            OwnerSeeder::class,
            StoreSettingSeeder::class,
            DeliveryZoneSeeder::class,
            ExpenseCategorySeeder::class,
            PageSeeder::class,
        ]);

        if (app()->environment('local')) {
            $this->call(DemoCatalogSeeder::class);
        }
    }
}
