<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InvoiceSequence extends Model
{
    protected $table = 'InvoiceSequence';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'year', 'prefix', 'lastNumber'
    ];

    protected $casts = [
        'year' => 'integer',
        'lastNumber' => 'integer',
    ];
}
