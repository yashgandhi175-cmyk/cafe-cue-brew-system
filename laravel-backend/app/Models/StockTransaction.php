<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockTransaction extends Model
{
    protected $table = 'StockTransaction';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'ingredientId', 'type', 'quantityChange', 'unitCostSnapshot', 'totalCostSnapshot', 'balanceBefore', 'balanceAfter', 'averageCostBefore', 'averageCostAfter', 'referenceType', 'referenceId', 'notes', 'changedById', 'createdAt', 'reversesStockTransactionId'
    ];

    protected $casts = [
        'quantityChange' => 'decimal:3',
        'unitCostSnapshot' => 'decimal:2',
        'totalCostSnapshot' => 'decimal:2',
        'balanceBefore' => 'decimal:3',
        'balanceAfter' => 'decimal:3',
        'averageCostBefore' => 'decimal:2',
        'averageCostAfter' => 'decimal:2',
        'createdAt' => 'datetime',
    ];

    public function ingredient() { return $this->belongsTo(Ingredient::class, 'ingredientId'); }
    public function changedBy() { return $this->belongsTo(Staff::class, 'changedById'); }
    public function reversesStockTransaction() { return $this->belongsTo(StockTransaction::class, 'reversesStockTransactionId'); }
    public function reversedByTransaction() { return $this->hasOne(StockTransaction::class, 'reversesStockTransactionId'); }
}
