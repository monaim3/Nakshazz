<?php

namespace Database\Seeders;

use App\Models\DeliveryZone;
use Illuminate\Database\Seeder;

class DeliveryZoneSeeder extends Seeder
{
    public function run(): void
    {
        DeliveryZone::query()->firstOrCreate(['name' => 'Inside Dhaka'], ['charge' => '70.00', 'sort_order' => 1]);
        DeliveryZone::query()->firstOrCreate(['name' => 'Outside Dhaka'], ['charge' => '130.00', 'sort_order' => 2]);
    }
}
