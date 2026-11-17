<?php

namespace Database\Seeders;

use App\Models\Page;
use Illuminate\Database\Seeder;

class PageSeeder extends Seeder
{
    /**
     * Placeholder pages; the owner edits the real text from the admin panel.
     */
    public function run(): void
    {
        $pages = [
            'about' => 'About Us',
            'privacy-policy' => 'Privacy Policy',
            'return-refund-policy' => 'Return & Refund Policy',
            'delivery-policy' => 'Delivery Policy',
        ];

        foreach ($pages as $slug => $title) {
            Page::query()->firstOrCreate(['slug' => $slug], [
                'title' => $title,
                'body' => "## {$title}\n\nContent coming soon.",
            ]);
        }
    }
}
