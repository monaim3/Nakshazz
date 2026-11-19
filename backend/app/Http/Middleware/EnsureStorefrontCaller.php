<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Keeps the public shop API for the shop itself.
 *
 * A request is let through when it comes from
 *  - the storefront's server (Next.js), which sends the shared X-Storefront-Key, or
 *  - a page of the storefront in a visitor's browser (its Origin / Referer is our site).
 * Anything else, such as the address typed into a browser tab, gets 401.
 *
 * This hides the API from casual browsing and scraping. It is not a secret store: the same
 * data is shown on the public website, and a determined person can copy a browser's headers.
 * Orders, customers and money stay behind the admin login, which this does not replace.
 */
class EnsureStorefrontCaller
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $key = (string) config('store.api_key');

        // not configured (tests, first install): the API stays open
        if ($key === '' || $this->hasKey($request, $key) || $this->comesFromStorefront($request)) {
            return $next($request);
        }

        return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
    }

    private function hasKey(Request $request, string $key): bool
    {
        return hash_equals($key, (string) $request->header('X-Storefront-Key'));
    }

    private function comesFromStorefront(Request $request): bool
    {
        $origin = $request->headers->get('Origin') ?? $this->originOf((string) $request->headers->get('Referer'));

        if ($origin === null || $origin === '') {
            return false;
        }

        $origin = rtrim($origin, '/');

        foreach ((array) config('cors.allowed_origins') as $allowed) {
            if ($origin === rtrim((string) $allowed, '/')) {
                return true;
            }
        }

        // development only: phones on the local network open the shop by the PC's address
        return app()->isLocal() && preg_match('#^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$#', $origin) === 1;
    }

    private function originOf(string $url): ?string
    {
        $parts = parse_url($url);

        if (! isset($parts['scheme'], $parts['host'])) {
            return null;
        }

        return $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');
    }
}
