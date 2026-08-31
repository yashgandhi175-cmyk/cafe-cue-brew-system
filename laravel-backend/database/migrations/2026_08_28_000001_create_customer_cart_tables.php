<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('CustomerCart')) {
            Schema::create('CustomerCart', function (Blueprint $table) {
                $table->string('id', 191)->primary();
                $table->string('tableId', 191)->unique();
                $table->timestamp('createdAt', 3)->useCurrent();
                $table->timestamp('updatedAt', 3)->useCurrent()->useCurrentOnUpdate();
            });
        }

        if (!Schema::hasTable('CustomerCartItem')) {
            Schema::create('CustomerCartItem', function (Blueprint $table) {
                $table->string('id', 191)->primary();
                $table->string('cartId', 191);
                $table->string('menuItemId', 191);
                $table->string('variantId', 191)->nullable();
                $table->string('addonIds', 191)->default('');
                $table->integer('quantity');
                $table->string('notes', 191)->nullable();
                $table->timestamp('createdAt', 3)->useCurrent();
                $table->timestamp('updatedAt', 3)->useCurrent()->useCurrentOnUpdate();

                $table->index('cartId');
            });
        }
    }

    public function down(): void
    {
        // Non-destructive: do not drop tables
    }
};
