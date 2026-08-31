<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Expense extends Model
{
    protected $table = 'Expense';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'expenseDate', 'category', 'title', 'amount', 'paymentMethod', 'referenceNumber', 'status', 'voidReason', 'notes', 'createdById', 'createdAt'
    ];

    protected $casts = [
        'expenseDate' => 'datetime',
        'amount' => 'decimal:2',
        'createdAt' => 'datetime',
    ];

    public function createdBy() { return $this->belongsTo(Staff::class, 'createdById'); }
}
