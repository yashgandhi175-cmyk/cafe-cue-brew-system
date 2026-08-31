<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Ingredient extends Model
{
    protected $table = 'Ingredient';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'name', 'sku', 'unit', 'category', 'currentStock', 'minimumStock', 'reorderLevel', 'lastPurchaseCost', 'averageCost', 'isActive', 'preferredSupplierId'
    ];

    protected $casts = [
        'currentStock' => 'decimal:3',
        'minimumStock' => 'decimal:3',
        'reorderLevel' => 'decimal:3',
        'lastPurchaseCost' => 'decimal:2',
        'averageCost' => 'decimal:2',
        'isActive' => 'boolean',
    ];

    public function preferredSupplier() { return $this->belongsTo(Supplier::class, 'preferredSupplierId'); }
    public function recipes() { return $this->hasMany(Recipe::class, 'ingredientId'); }
    public function stockTransactions() { return $this->hasMany(StockTransaction::class, 'ingredientId'); }
    public function purchaseItems() { return $this->hasMany(PurchaseItem::class, 'ingredientId'); }
    public function wastageEntries() { return $this->hasMany(WastageEntry::class, 'ingredientId'); }

    public function scopeActive($query, ?bool $active = null)
    {
        if ($active === null) {
            return $query;
        }
        return $query->where('isActive', $active);
    }
}
