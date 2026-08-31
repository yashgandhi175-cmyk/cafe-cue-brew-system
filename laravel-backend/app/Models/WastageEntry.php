<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WastageEntry extends Model
{
    protected $table = 'WastageEntry';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'ingredientId', 'quantity', 'reason', 'notes', 'recordedById', 'recordedAt'
    ];

    protected $casts = [
        'quantity' => 'decimal:3',
        'recordedAt' => 'datetime',
    ];

    public function ingredient() { return $this->belongsTo(Ingredient::class, 'ingredientId'); }
    public function recordedBy() { return $this->belongsTo(Staff::class, 'recordedById'); }
}
