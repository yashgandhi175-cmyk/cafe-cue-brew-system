<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CreditPayment extends Model
{
    protected $table = 'CreditPayment';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'creditLedgerId', 'amount', 'method', 'reference', 'paidAt', 'receivedById'
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'paidAt' => 'datetime',
    ];

    public function creditLedger() { return $this->belongsTo(CreditLedger::class, 'creditLedgerId'); }
    public function receivedBy() { return $this->belongsTo(Staff::class, 'receivedById'); }
}
