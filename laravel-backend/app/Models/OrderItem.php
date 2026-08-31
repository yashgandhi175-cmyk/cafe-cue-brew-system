<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderItem extends Model
{
    protected $table = 'OrderItem';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'orderId', 'menuItemId', 'nameSnapshot', 'variantId', 'variantNameSnapshot', 'priceSnapshot', 'variantPriceSnapshot', 'discountSnapshot', 'quantity', 'notes', 'totalPrice'
    ];

    protected $casts = [
        'priceSnapshot' => 'decimal:2',
        'variantPriceSnapshot' => 'decimal:2',
        'discountSnapshot' => 'decimal:2',
        'quantity' => 'integer',
        'totalPrice' => 'decimal:2',
    ];

    public function order() { return $this->belongsTo(Order::class, 'orderId'); }
    public function menuItem() { return $this->belongsTo(MenuItem::class, 'menuItemId'); }
    public function variant() { return $this->belongsTo(MenuVariant::class, 'variantId'); }
    public function addons() { return $this->hasMany(OrderItemAddon::class, 'orderItemId'); }
}
