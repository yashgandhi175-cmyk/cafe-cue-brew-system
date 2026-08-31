<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SplitPayment extends Model
{
    protected $table = 'SplitPayment';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'paymentId', 'method', 'amount', 'reference'
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function payment() { return $this->belongsTo(Payment::class, 'paymentId'); }
}
