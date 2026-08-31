<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('StockTransaction')) {
            DB::statement("ALTER TABLE `StockTransaction` MODIFY COLUMN `type` ENUM('OPENING_STOCK','PURCHASE','PURCHASE_REVERSAL','RECIPE_CONSUMPTION','CONSUMPTION_REVERSAL','WASTAGE','WASTAGE_REVERSAL','ADJUSTMENT_IN','ADJUSTMENT_OUT','STOCK_COUNT_VARIANCE') NOT NULL");
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('StockTransaction')) {
            DB::statement("ALTER TABLE `StockTransaction` MODIFY COLUMN `type` ENUM('OPENING_STOCK','PURCHASE','PURCHASE_REVERSAL','RECIPE_CONSUMPTION','CONSUMPTION_REVERSAL','WASTAGE','ADJUSTMENT_IN','ADJUSTMENT_OUT','STOCK_COUNT_VARIANCE') NOT NULL");
        }
    }
};
