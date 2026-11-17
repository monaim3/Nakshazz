<?php

namespace Database\Seeders;

use App\Models\StoreSetting;
use Illuminate\Database\Seeder;

class StoreSettingSeeder extends Seeder
{
    /**
     * Default settings. Existing values are never overwritten.
     */
    public function run(): void
    {
        /** @var array<string, array{0: mixed, 1: bool}> $defaults key => [value, is_public] */
        $defaults = [
            'store_name' => ['Nakshazz', true],
            'tagline' => ['Handmade jewellery, crafted with love', true],
            'logo_path' => [null, true],
            'phone' => [null, true],
            'whatsapp_number' => [null, true],
            'email' => [null, true],
            'address' => [null, true],
            'facebook_url' => [null, true],
            'instagram_url' => [null, true],
            'currency' => ['BDT', true],
            'currency_symbol' => ['৳', true],
            'cod_enabled' => [true, true],
            'bkash_enabled' => [true, true],
            'bkash_number' => [null, true],
            'bkash_account_type' => ['personal', true],
            'bkash_instructions' => ['Send Money to the number above, then enter your bKash number and the Transaction ID (TrxID) below.', true],
            'low_stock_threshold' => [3, false],
            'order_notification_email' => [null, false],
        ];

        foreach ($defaults as $key => [$value, $isPublic]) {
            StoreSetting::query()->firstOrCreate(['key' => $key], ['value' => $value, 'is_public' => $isPublic]);
        }
    }
}
