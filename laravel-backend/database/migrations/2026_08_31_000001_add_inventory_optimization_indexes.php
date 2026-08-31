<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('OrderItemAddon')) {
            Schema::table('OrderItemAddon', function (Blueprint $table) {
                $table->index('addonId', 'OrderItemAddon_addonId_idx');
            });
        }

        if (Schema::hasTable('Order')) {
            Schema::table('Order', function (Blueprint $table) {
                $table->index('inventoryDeducted', 'Order_inventoryDeducted_idx');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('OrderItemAddon')) {
            Schema::table('OrderItemAddon', function (Blueprint $table) {
                $table->dropIndex('OrderItemAddon_addonId_idx');
            });
        }

        if (Schema::hasTable('Order')) {
            Schema::table('Order', function (Blueprint $table) {
                $table->dropIndex('Order_inventoryDeducted_idx');
            });
        }
    }
};
