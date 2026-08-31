<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderItemAddon extends Model
{
    protected $table = 'OrderItemAddon';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'orderItemId', 'addonId', 'nameSnapshot', 'priceSnapshot'
    ];

    protected $casts = [
        'priceSnapshot' => 'decimal:2',
    ];

    public function orderItem() { return $this->belongsTo(OrderItem::class, 'orderItemId'); }
    public function addon() { return $this->belongsTo(Addon::class, 'addonId'); }
}
