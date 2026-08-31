<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderStatusHistory extends Model
{
    protected $table = 'OrderStatusHistory';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'orderId', 'oldStatus', 'newStatus', 'changedById', 'changedAt', 'notes'
    ];

    protected $casts = [
        'changedAt' => 'datetime',
    ];

    public function order() { return $this->belongsTo(Order::class, 'orderId'); }
    public function changedBy() { return $this->belongsTo(Staff::class, 'changedById'); }
}
