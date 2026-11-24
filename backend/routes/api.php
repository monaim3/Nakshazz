<?php

use App\Http\Controllers\Api\V1\Storefront;
use Illuminate\Support\Facades\Route;

/*
| Public storefront API. Admin routes live in routes/admin.php.
| "storefront" lets in only our own website (see EnsureStorefrontCaller).
*/
Route::prefix('v1')->name('v1.')->middleware(['storefront', 'throttle:storefront'])->group(function () {

    // Read-only, cacheable by browsers/CDN for a short time.
    Route::middleware('cache.headers:public;max_age=60;etag')->group(function () {
        Route::get('settings', Storefront\SettingsController::class)->name('settings');
        Route::get('home', Storefront\HomeController::class)->name('home');
        Route::get('categories', [Storefront\CategoryController::class, 'index'])->name('categories.index');
        Route::get('categories/{slug}', [Storefront\CategoryController::class, 'show'])->name('categories.show');
        Route::get('products/facets', [Storefront\ProductController::class, 'facets'])->name('products.facets');
        Route::get('products', [Storefront\ProductController::class, 'index'])->name('products.index');
        Route::get('products/{slug}', [Storefront\ProductController::class, 'show'])->name('products.show');
        Route::get('products/{slug}/reviews', [Storefront\ProductController::class, 'reviews'])->name('products.reviews');
        Route::get('pages/{page:slug}', [Storefront\PageController::class, 'show'])->name('pages.show');
        Route::get('sitemap', Storefront\SitemapController::class)->name('sitemap');
    });

    Route::post('cart/validate', Storefront\CartController::class)->middleware('throttle:cart')->name('cart.validate');
    Route::post('coupons/apply', Storefront\CartController::class)->middleware('throttle:coupon')->name('coupons.apply');
    Route::post('checkout', Storefront\CheckoutController::class)->middleware(['throttle:checkout', 'idempotent'])->name('checkout');

    Route::post('orders/track', [Storefront\OrderLookupController::class, 'track'])->middleware('throttle:tracking')->name('orders.track');
    Route::get('orders/{uuid}', [Storefront\OrderLookupController::class, 'show'])->middleware('throttle:tracking')->name('orders.show');

    Route::post('products/{slug}/reviews', [Storefront\ReviewController::class, 'store'])->middleware('throttle:submissions')->name('reviews.store');
    Route::post('contact', Storefront\ContactController::class)->middleware('throttle:submissions')->name('contact');
});
