<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * SMS sent to customers about their order (confirmed, shipped, delivered), with the
 * gateway's answer — so the shop can see what each customer was told.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('phone', 14);
            $table->string('event', 20);
            $table->text('message');
            $table->string('status', 20);
            $table->string('gateway', 30);
            $table->string('response', 255)->nullable();
            $table->timestamps();

            $table->index(['order_id', 'event']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_logs');
    }
};
