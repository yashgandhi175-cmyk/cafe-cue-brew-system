<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderStockConsumptionReversal extends Model
{
    protected $table = 'OrderStockConsumptionReversal';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'orderId', 'reversedAt'
    ];

    protected $casts = [
        'reversedAt' => 'datetime',
    ];

    public function order() { return $this->belongsTo(Order::class, 'orderId'); }
}
