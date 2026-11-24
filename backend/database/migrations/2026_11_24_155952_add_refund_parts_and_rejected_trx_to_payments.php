<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Refunds now record which part gave back the delivery charge and which part was extra
 * goodwill (so profit drops by exactly what was handed back), and a rejected payment keeps
 * its TrxID aside so the same TrxID can be recorded again if it was rejected by mistake.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->decimal('delivery_amount', 12, 2)->default(0)->after('fee');
            $table->decimal('goodwill_amount', 12, 2)->default(0)->after('delivery_amount');
            $table->string('rejected_transaction_id', 60)->nullable()->after('transaction_id');
        });

        DB::table('payments')->where('status', 'rejected')->whereNotNull('transaction_id')->update([
            'rejected_transaction_id' => DB::raw('transaction_id'),
            'transaction_id' => null,
        ]);
    }

    public function down(): void
    {
        DB::table('payments')->where('status', 'rejected')->whereNotNull('rejected_transaction_id')->update([
            'transaction_id' => DB::raw('rejected_transaction_id'),
        ]);

        Schema::table('payments', function (Blueprint $table) {
            $table->dropColumn(['delivery_amount', 'goodwill_amount', 'rejected_transaction_id']);
        });
    }
};
