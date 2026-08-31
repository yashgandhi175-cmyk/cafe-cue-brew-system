<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseItem extends Model
{
    protected $table = 'PurchaseItem';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'purchaseId', 'ingredientId', 'ingredientNameSnapshot', 'purchaseUnit', 'purchaseQuantity', 'conversionFactor', 'baseQuantityAdded', 'unitPurchaseCost', 'baseUnitCostSnapshot', 'tax', 'lineTotal'
    ];

    protected $casts = [
        'purchaseQuantity' => 'decimal:3',
        'conversionFactor' => 'decimal:3',
        'baseQuantityAdded' => 'decimal:3',
        'unitPurchaseCost' => 'decimal:2',
        'baseUnitCostSnapshot' => 'decimal:4',
        'tax' => 'decimal:2',
        'lineTotal' => 'decimal:2',
    ];

    public function purchase() { return $this->belongsTo(Purchase::class, 'purchaseId'); }
    public function ingredient() { return $this->belongsTo(Ingredient::class, 'ingredientId'); }
}
