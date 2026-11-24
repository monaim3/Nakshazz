<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * The same request sent twice (a retry after a network drop, a double tap that slipped
 * through) is done once. The browser sends an `Idempotency-Key` header, the same value for
 * every retry of one attempt; a repeat gets the first answer back instead of a second
 * order / sale / payment / refund. Requests without the header work as before.
 */
class Idempotent
{
    private const TTL_SECONDS = 86400;

    public function handle(Request $request, Closure $next): Response
    {
        $key = trim((string) $request->header('Idempotency-Key'));

        if ($key === '' || strlen($key) > 100) {
            return $next($request);
        }

        $cacheKey = 'idem:'.sha1(implode('|', [$request->method(), $request->path(), $request->user()?->id ?? $request->ip(), $key]));

        // a second copy arriving while the first is still running waits for it
        return Cache::lock($cacheKey.':lock', 30)->block(20, function () use ($cacheKey, $request, $next) {
            if ($saved = Cache::get($cacheKey)) {
                return response($saved['body'], $saved['status'], ['Content-Type' => 'application/json', 'Idempotent-Replayed' => 'true']);
            }

            $response = $next($request);

            if ($response->isSuccessful()) {
                Cache::put($cacheKey, ['status' => $response->getStatusCode(), 'body' => $response->getContent()], self::TTL_SECONDS);
            }

            return $response;
        });
    }
}
