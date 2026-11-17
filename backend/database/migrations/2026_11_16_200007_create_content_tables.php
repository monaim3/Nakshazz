<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('customer_name', 100);
            $table->unsignedTinyInteger('rating');
            $table->text('comment');
            $table->string('source', 20)->default('website');
            $table->string('status', 20)->default('pending');
            $table->boolean('is_featured')->default(false);
            $table->string('ip_address', 45)->nullable();
            $table->timestamps();

            $table->index(['product_id', 'status']);
            $table->index(['status', 'is_featured']);
        });

        Schema::create('banners', function (Blueprint $table) {
            $table->id();
            $table->string('title', 150);
            $table->string('subtitle', 255)->nullable();
            $table->string('image_path');
            $table->string('mobile_image_path')->nullable();
            $table->string('link_url', 255)->nullable();
            $table->string('button_text', 40)->nullable();
            $table->string('placement', 20);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamps();

            $table->index(['placement', 'is_active']);
        });

        Schema::create('pages', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 80)->unique();
            $table->string('title', 150);
            $table->longText('body');
            $table->string('seo_title', 70)->nullable();
            $table->string('seo_description', 170)->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('store_settings', function (Blueprint $table) {
            $table->string('key', 80)->primary();
            $table->json('value')->nullable();
            $table->boolean('is_public')->default(false);
            $table->timestamps();
        });

        Schema::create('contact_messages', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('phone', 14)->nullable();
            $table->string('email', 150)->nullable();
            $table->text('message');
            $table->boolean('is_read')->default(false);
            $table->string('ip_address', 45)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_messages');
        Schema::dropIfExists('store_settings');
        Schema::dropIfExists('pages');
        Schema::dropIfExists('banners');
        Schema::dropIfExists('reviews');
    }
};
