<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('order_number', 20)->nullable()->unique();
            $table->string('source', 20);
            $table->string('channel', 20);
            $table->string('status', 20);
            $table->string('payment_status', 30)->default('unpaid');
            $table->string('payment_method', 30);

            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('customer_name', 100)->nullable();
            $table->string('customer_phone', 14)->nullable();
            $table->string('customer_email', 150)->nullable();
            $table->string('shipping_address', 255)->nullable();
            $table->string('shipping_area', 100)->nullable();
            $table->string('shipping_city', 100)->nullable();
            $table->foreignId('delivery_zone_id')->nullable()->constrained()->nullOnDelete();
            $table->string('delivery_zone_name', 50)->nullable();

            $table->decimal('items_subtotal', 12, 2);
            $table->decimal('coupon_discount', 12, 2)->default(0);
            $table->decimal('manual_discount', 12, 2)->default(0);
            $table->decimal('delivery_charge', 12, 2)->default(0);
            $table->decimal('grand_total', 12, 2);
            $table->decimal('cogs_total', 12, 2);
            $table->decimal('delivery_cost', 12, 2)->nullable();

            $table->foreignId('coupon_id')->nullable()->constrained()->nullOnDelete();
            $table->string('coupon_code', 40)->nullable();
            $table->string('courier_name', 50)->nullable();
            $table->string('tracking_code', 100)->nullable();
            $table->text('customer_note')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('ip_address', 45)->nullable();

            $table->timestamp('placed_at');
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamp('shipped_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('returned_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'placed_at']);
            $table->index(['channel', 'placed_at']);
            $table->index('placed_at');
            $table->index('delivered_at');
            $table->index('returned_at');
            $table->index('customer_phone');
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('variant_id')->nullable()->constrained('product_variants')->restrictOnDelete();
            $table->string('product_name', 150);
            $table->string('variant_title', 150);
            $table->string('sku', 60);
            $table->decimal('unit_price', 12, 2);
            $table->decimal('unit_cost', 12, 2);
            $table->json('cost_breakdown')->nullable();
            $table->unsignedInteger('quantity');
            $table->decimal('line_subtotal', 12, 2);
            $table->decimal('discount_allocated', 12, 2)->default(0);
            $table->decimal('line_total', 12, 2);
            $table->unsignedInteger('returned_quantity')->default(0);
            $table->unsignedInteger('damaged_quantity')->default(0);
            $table->timestamps();
        });

        Schema::create('order_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20);
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('note', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('order_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('coupon_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('coupon_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('customer_phone', 14)->nullable();
            $table->decimal('discount_amount', 12, 2);
            $table->timestamp('created_at')->useCurrent();

            $table->index(['coupon_id', 'customer_phone']);
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('type', 10);
            $table->string('method', 30);
            $table->decimal('amount', 12, 2);
            $table->decimal('fee', 12, 2)->default(0);
            $table->string('transaction_id', 60)->nullable();
            $table->string('sender_number', 14)->nullable();
            $table->string('status', 20);
            $table->string('refund_reason', 20)->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->json('gateway_payload')->nullable();
            $table->string('note', 255)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['method', 'transaction_id']);
            $table->index(['status', 'paid_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
        Schema::dropIfExists('coupon_usages');
        Schema::dropIfExists('order_notes');
        Schema::dropIfExists('order_status_histories');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
    }
};
