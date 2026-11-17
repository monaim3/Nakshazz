<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Tells the Next.js storefront to refresh cached pages after the admin changes content,
 * so static pages stay fast but update within seconds.
 */
class StorefrontRevalidator
{
    /**
     * @param  list<string>  $tags  e.g. ['products', 'product:moon-ring', 'home']
     */
    public function revalidate(array $tags): void
    {
        $secret = config('store.revalidate_secret');

        if (empty($secret) || app()->runningUnitTests()) {
            return;
        }

        $url = rtrim((string) config('store.frontend_url'), '/').'/api/revalidate';

        defer(function () use ($url, $secret, $tags): void {
            try {
                Http::timeout(3)->withToken($secret)->post($url, ['tags' => array_values(array_unique($tags))]);
            } catch (Throwable $exception) {
                Log::warning('Storefront revalidation failed', ['tags' => $tags, 'error' => $exception->getMessage()]);
            }
        });
    }
}
