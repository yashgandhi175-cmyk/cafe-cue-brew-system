<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderStockConsumption extends Model
{
    protected $table = 'OrderStockConsumption';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'orderId', 'consumedAt'
    ];

    protected $casts = [
        'consumedAt' => 'datetime',
    ];

    public function order() { return $this->belongsTo(Order::class, 'orderId'); }
}
