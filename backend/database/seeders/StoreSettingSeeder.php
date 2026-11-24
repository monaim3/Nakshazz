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
            // New sale: staff may not give more than this % off the list price, nor sell below cost
            'staff_max_discount_percent' => [20, false],
            // reorder suggestions cover this many days of sales
            'reorder_cover_days' => [30, false],
            // order messages to customers (the gateway itself is configured in .env)
            'sms_enabled' => [false, false],
            'sms_on_confirmed' => [true, false],
            'sms_on_shipped' => [true, false],
            'sms_on_delivered' => [false, false],
        ];

        foreach ($defaults as $key => [$value, $isPublic]) {
            StoreSetting::query()->firstOrCreate(['key' => $key], ['value' => $value, 'is_public' => $isPublic]);
        }
    }
}
