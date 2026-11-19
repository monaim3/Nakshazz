<?php

use App\Http\Middleware\EnsureStorefrontCaller;
use App\Http\Middleware\EnsureUserIsActive;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function (): void {
            Route::middleware('api')
                ->prefix('api/v1/admin')
                ->name('admin.')
                ->group(base_path('routes/admin.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Admin SPA authenticates with Sanctum session cookies + CSRF.
        $middleware->statefulApi();
        // Public guest endpoints use no login cookie, so CSRF protects nothing there; they are
        // rate limited instead. Without this, requests from the storefront origin get 419.
        $middleware->validateCsrfTokens(except: [
            'api/v1/cart/validate',
            'api/v1/coupons/apply',
            'api/v1/checkout',
            'api/v1/orders/track',
            'api/v1/products/*/reviews',
            'api/v1/contact',
        ]);
        $middleware->alias(['active' => EnsureUserIsActive::class, 'storefront' => EnsureStorefrontCaller::class]);
        // API only: there is no login page to send a guest to. Without this, opening an admin
        // address in a browser tab crashed with "Route [login] not defined" instead of a 401.
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
