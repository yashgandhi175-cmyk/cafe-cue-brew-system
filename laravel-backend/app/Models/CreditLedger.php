<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CreditLedger extends Model
{
    protected $table = 'CreditLedger';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'customerId', 'invoiceNumber', 'invoiceDate', 'billAmount', 'outstandingAmount', 'creditDate', 'dueDate', 'creditType', 'notes', 'settlementStatus', 'createdById', 'updatedById'
    ];

    protected $casts = [
        'invoiceDate' => 'datetime',
        'billAmount' => 'decimal:2',
        'outstandingAmount' => 'decimal:2',
        'creditDate' => 'datetime',
        'dueDate' => 'datetime',
    ];

    public function customer() { return $this->belongsTo(Customer::class, 'customerId'); }
    public function payments() { return $this->hasMany(CreditPayment::class, 'creditLedgerId'); }
    public function createdBy() { return $this->belongsTo(Staff::class, 'createdById'); }
    public function updatedBy() { return $this->belongsTo(Staff::class, 'updatedById'); }
}
