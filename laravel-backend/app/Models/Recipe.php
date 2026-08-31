<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Recipe extends Model
{
    protected $table = 'Recipe';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'menuItemId', 'variantId', 'addonId', 'ingredientId', 'quantity'
    ];

    protected $casts = [
        'quantity' => 'decimal:3',
    ];

    public function menuItem() { return $this->belongsTo(MenuItem::class, 'menuItemId'); }
    public function variant() { return $this->belongsTo(MenuVariant::class, 'variantId'); }
    public function addon() { return $this->belongsTo(Addon::class, 'addonId'); }
    public function ingredient() { return $this->belongsTo(Ingredient::class, 'ingredientId'); }
}
