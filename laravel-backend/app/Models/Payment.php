<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    protected $table = 'Payment';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'orderId', 'billId', 'method', 'amount', 'amountTendered', 'changeDue', 'reference', 'status', 'isSettled', 'paidAt', 'receivedById', 'paymentIdempotencyKey'
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'amountTendered' => 'decimal:2',
        'changeDue' => 'decimal:2',
        'isSettled' => 'boolean',
        'paidAt' => 'datetime',
    ];

    public function order() { return $this->belongsTo(Order::class, 'orderId'); }
    public function bill() { return $this->belongsTo(Bill::class, 'billId'); }
    public function receivedBy() { return $this->belongsTo(Staff::class, 'receivedById'); }
    public function splitPayments() { return $this->hasMany(SplitPayment::class, 'paymentId'); }
}
