<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerCartItem extends Model
{
    protected $table = 'CustomerCartItem';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'cartId', 'menuItemId', 'variantId', 'addonIds', 'quantity', 'notes'
    ];

    protected $casts = [
        'quantity' => 'integer',
    ];

    public function cart() { return $this->belongsTo(CustomerCart::class, 'cartId'); }
    public function menuItem() { return $this->belongsTo(MenuItem::class, 'menuItemId'); }
    public function variant() { return $this->belongsTo(MenuVariant::class, 'variantId'); }
}
