<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('StockTransaction')) {
            Schema::table('StockTransaction', function (Blueprint $table) {
                if (!Schema::hasColumn('StockTransaction', 'notes')) {
                    $table->string('notes', 255)->nullable()->after('referenceId');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('StockTransaction')) {
            Schema::table('StockTransaction', function (Blueprint $table) {
                if (Schema::hasColumn('StockTransaction', 'notes')) {
                    $table->dropColumn('notes');
                }
            });
        }
    }
};
