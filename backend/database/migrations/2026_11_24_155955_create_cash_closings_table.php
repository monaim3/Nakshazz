<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Daily closing: what the system says came in per payment method that day, what the owner
 * actually counted (cash box, bKash app, courier statement) and the difference.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_closings', function (Blueprint $table) {
            $table->id();
            $table->date('closing_date');
            $table->string('method', 30);
            $table->decimal('expected', 12, 2);
            $table->decimal('counted', 12, 2);
            $table->decimal('difference', 12, 2);
            $table->string('note', 255)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->unique(['closing_date', 'method']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_closings');
    }
};
