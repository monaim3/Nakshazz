<?php

use App\Http\Controllers\Api\V1\Admin;
use Illuminate\Support\Facades\Route;

/*
| Admin API, mounted at /api/v1/admin (see bootstrap/app.php).
| Staff: day-to-day operations. Owner: + finances, coupons, settings, users.
*/

Route::post('login', [Admin\AuthController::class, 'login'])->middleware('throttle:login')->name('login');

Route::middleware(['auth:sanctum', 'active'])->group(function () {
    Route::post('logout', [Admin\AuthController::class, 'logout'])->name('logout');
    Route::get('me', [Admin\AuthController::class, 'me'])->name('me');

    Route::get('dashboard', Admin\DashboardController::class)->name('dashboard');

    // Catalog
    Route::apiResource('categories', Admin\CategoryController::class)->except('show');
    Route::apiResource('products', Admin\ProductController::class);
    Route::post('products/{product}/images', [Admin\ProductImageController::class, 'store'])->name('products.images.store');
    Route::patch('images/{image}', [Admin\ProductImageController::class, 'update'])->name('images.update');
    Route::delete('images/{image}', [Admin\ProductImageController::class, 'destroy'])->name('images.destroy');

    // Inventory
    Route::get('inventory', [Admin\InventoryController::class, 'index'])->name('inventory.index');
    Route::get('inventory/{variant}/movements', [Admin\InventoryController::class, 'movements'])->name('inventory.movements');
    Route::post('inventory/adjust', [Admin\InventoryController::class, 'adjust'])->name('inventory.adjust');

    // Orders & manual sales
    Route::get('orders', [Admin\OrderController::class, 'index'])->name('orders.index');
    Route::get('orders/{order}', [Admin\OrderController::class, 'show'])->name('orders.show');
    Route::post('orders/{order}/status', [Admin\OrderController::class, 'updateStatus'])->name('orders.status');
    Route::patch('orders/{order}/shipping', [Admin\OrderController::class, 'updateShipping'])->name('orders.shipping');
    Route::post('orders/{order}/notes', [Admin\OrderController::class, 'storeNote'])->name('orders.notes');
    Route::post('orders/{order}/returns', [Admin\OrderController::class, 'storeReturn'])->name('orders.returns');
    Route::post('manual-sales', [Admin\OrderController::class, 'storeManual'])->name('manual-sales.store');

    // Payments
    Route::get('payments/pending', [Admin\PaymentController::class, 'pending'])->name('payments.pending');
    Route::post('orders/{order}/payments', [Admin\PaymentController::class, 'store'])->name('orders.payments.store');
    Route::post('payments/{payment}/verify', [Admin\PaymentController::class, 'verify'])->name('payments.verify');
    Route::post('payments/{payment}/reject', [Admin\PaymentController::class, 'reject'])->name('payments.reject');

    // Customers & content
    Route::get('customers', [Admin\CustomerController::class, 'index'])->name('customers.index');
    Route::get('customers/{customer}', [Admin\CustomerController::class, 'show'])->name('customers.show');
    Route::patch('customers/{customer}', [Admin\CustomerController::class, 'update'])->name('customers.update');

    Route::apiResource('reviews', Admin\ReviewController::class)->except('show');

    Route::get('banners', [Admin\ContentController::class, 'banners'])->name('banners.index');
    Route::post('banners', [Admin\ContentController::class, 'storeBanner'])->name('banners.store');
    Route::post('banners/{banner}', [Admin\ContentController::class, 'updateBanner'])->name('banners.update');
    Route::delete('banners/{banner}', [Admin\ContentController::class, 'destroyBanner'])->name('banners.destroy');
    Route::get('pages', [Admin\ContentController::class, 'pages'])->name('pages.index');
    Route::put('pages/{page:slug}', [Admin\ContentController::class, 'updatePage'])->name('pages.update');

    Route::get('messages', [Admin\ContactMessageController::class, 'index'])->name('messages.index');
    Route::post('messages/{message}/read', [Admin\ContactMessageController::class, 'markRead'])->name('messages.read');

    // Owner only: money and store-wide control
    Route::middleware('can:view-financials')->group(function () {
        Route::post('orders/{order}/refunds', [Admin\PaymentController::class, 'refund'])->name('orders.refunds');

        Route::get('reports/summary', [Admin\ReportController::class, 'summary'])->name('reports.summary');
        Route::get('reports/channels', [Admin\ReportController::class, 'channels'])->name('reports.channels');
        Route::get('reports/products', [Admin\ReportController::class, 'products'])->name('reports.products');
        Route::get('reports/monthly', [Admin\ReportController::class, 'monthly'])->name('reports.monthly');

        Route::get('expenses', [Admin\ExpenseController::class, 'index'])->name('expenses.index');
        Route::post('expenses', [Admin\ExpenseController::class, 'store'])->name('expenses.store');
        Route::post('expenses/{expense}', [Admin\ExpenseController::class, 'update'])->name('expenses.update');
        Route::delete('expenses/{expense}', [Admin\ExpenseController::class, 'destroy'])->name('expenses.destroy');
        Route::get('expenses/{expense}/attachment', [Admin\ExpenseController::class, 'attachment'])->name('expenses.attachment');
        Route::get('expense-categories', [Admin\ExpenseController::class, 'categories'])->name('expense-categories.index');
        Route::post('expense-categories', [Admin\ExpenseController::class, 'storeCategory'])->name('expense-categories.store');
        Route::patch('expense-categories/{category}', [Admin\ExpenseController::class, 'updateCategory'])->name('expense-categories.update');
    });

    Route::middleware('can:manage-store')->group(function () {
        Route::apiResource('coupons', Admin\CouponController::class)->except('show');

        Route::get('settings', [Admin\SettingsController::class, 'show'])->name('settings.show');
        Route::post('settings', [Admin\SettingsController::class, 'update'])->name('settings.update');
        Route::post('delivery-zones', [Admin\SettingsController::class, 'storeZone'])->name('delivery-zones.store');
        Route::patch('delivery-zones/{zone}', [Admin\SettingsController::class, 'updateZone'])->name('delivery-zones.update');

        Route::get('users', [Admin\UserController::class, 'index'])->name('users.index');
        Route::post('users', [Admin\UserController::class, 'store'])->name('users.store');
        Route::patch('users/{user}', [Admin\UserController::class, 'update'])->name('users.update');
    });
});
