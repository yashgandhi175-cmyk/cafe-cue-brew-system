<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MenuItem extends Model
{
    protected $table = 'MenuItem';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'name', 'description', 'categoryId', 'image', 'basePrice', 'isVeg', 'available', 'popular', 'recommended', 'bestSeller', 'prepTime', 'displayOrder', 'isActive'
    ];

    protected $casts = [
        'basePrice' => 'decimal:2',
        'isVeg' => 'boolean',
        'available' => 'boolean',
        'popular' => 'boolean',
        'recommended' => 'boolean',
        'bestSeller' => 'boolean',
        'prepTime' => 'integer',
        'displayOrder' => 'integer',
        'isActive' => 'boolean',
    ];

    public function category() { return $this->belongsTo(Category::class, 'categoryId'); }
    public function variants() { return $this->hasMany(MenuVariant::class, 'menuItemId'); }
    public function menuItemAddons() { return $this->hasMany(MenuItemAddon::class, 'menuItemId'); }
    public function orderItems() { return $this->hasMany(OrderItem::class, 'menuItemId'); }
    public function recipes() { return $this->hasMany(Recipe::class, 'menuItemId'); }
    public function banners() { return $this->hasMany(Banner::class, 'targetMenuItemId'); }
    public function cartItems() { return $this->hasMany(CustomerCartItem::class, 'menuItemId'); }
}
