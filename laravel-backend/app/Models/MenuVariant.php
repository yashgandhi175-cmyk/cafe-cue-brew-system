<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MenuVariant extends Model
{
    protected $table = 'MenuVariant';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'menuItemId', 'name', 'price', 'isActive'
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'isActive' => 'boolean',
    ];

    public function menuItem() { return $this->belongsTo(MenuItem::class, 'menuItemId'); }
    public function recipes() { return $this->hasMany(Recipe::class, 'variantId'); }
    public function orderItems() { return $this->hasMany(OrderItem::class, 'variantId'); }
    public function cartItems() { return $this->hasMany(CustomerCartItem::class, 'variantId'); }
}
