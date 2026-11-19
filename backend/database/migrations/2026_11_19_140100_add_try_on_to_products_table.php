<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Virtual try-on: where the piece sits (earring / necklace / nose), a transparent
     * front-view photo of it, and its real size so it is drawn at true scale on the face.
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('tryon_type', 20)->nullable()->after('preparation_days');
            $table->string('tryon_image_path')->nullable()->after('tryon_type');
            $table->unsignedSmallInteger('tryon_size_mm')->nullable()->after('tryon_image_path');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['tryon_type', 'tryon_image_path', 'tryon_size_mm']);
        });
    }
};
