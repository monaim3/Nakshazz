<?php

namespace App\Providers;

use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\StoreSettings;
use App\Support\PhoneNumber;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(StoreSettings::class);
    }

    public function boot(): void
    {
        Model::preventLazyLoading(! $this->app->isProduction());
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());

        $this->configureRateLimiting();
        $this->configureGates();
        ActivityLogger::register();
    }

    /**
     * Owner-only areas. Staff can run the shop (orders, POS, products, stock)
     * but never see costs, profit, expenses or store-wide settings.
     */
    private function configureGates(): void
    {
        Gate::define('view-financials', fn (User $user) => $user->isOwner());
        Gate::define('manage-store', fn (User $user) => $user->isOwner());
    }

    private function configureRateLimiting(): void
    {
        RateLimiter::for('storefront', fn (Request $request) => Limit::perMinute(120)->by($request->ip()));

        // Stops fake COD order floods: per network and per phone number.
        RateLimiter::for('checkout', fn (Request $request) => [
            Limit::perHour(30)->by('ip:'.$request->ip()),
            Limit::perHour(5)->by('phone:'.(PhoneNumber::normalize($request->input('customer.phone')) ?? $request->ip())),
        ]);

        RateLimiter::for('cart', fn (Request $request) => Limit::perMinute(60)->by($request->ip()));
        RateLimiter::for('coupon', fn (Request $request) => Limit::perMinute(10)->by($request->ip()));
        RateLimiter::for('tracking', fn (Request $request) => Limit::perMinute(10)->by($request->ip()));
        RateLimiter::for('submissions', fn (Request $request) => Limit::perHour(5)->by($request->ip()));

        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute(5)->by(Str::lower((string) $request->input('email')).'|'.$request->ip()),
            Limit::perHour(30)->by($request->ip()),
        ]);
    }
}
