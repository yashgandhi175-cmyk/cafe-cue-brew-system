<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('TableSession')) {
            Schema::create('TableSession', function (Blueprint $table) {
                $table->string('id')->primary();
                $table->string('tableId');
                $table->string('status')->default('OPEN');
                $table->dateTime('createdAt')->useCurrent();
                $table->dateTime('closedAt')->nullable();

                $table->foreign('tableId')->references('id')->on('RestaurantTable')->onDelete('cascade');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('TableSession');
    }
};
