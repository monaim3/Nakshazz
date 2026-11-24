<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One row per return event, dated, so reports book a return in the month it happened
 * (the sale stays in its own month). Existing returns are copied in once.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_item_returns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_item_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            $table->unsignedInteger('damaged')->default(0);
            $table->decimal('value', 12, 2);
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('returned_at');
            $table->timestamps();

            $table->index('returned_at');
        });

        $items = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('order_items.returned_quantity', '>', 0)
            ->get(['order_items.*', 'orders.returned_at as order_returned_at']);

        foreach ($items as $item) {
            $at = $item->order_returned_at ?? $item->updated_at;
            DB::table('order_item_returns')->insert([
                'order_id' => $item->order_id,
                'order_item_id' => $item->id,
                'quantity' => $item->returned_quantity,
                'damaged' => $item->damaged_quantity,
                'value' => round($item->line_total * $item->returned_quantity / $item->quantity, 2),
                'returned_at' => $at,
                'created_at' => $at,
                'updated_at' => $at,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('order_item_returns');
    }
};
