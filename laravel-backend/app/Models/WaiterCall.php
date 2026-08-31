<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WaiterCall extends Model
{
    protected $table = 'WaiterCall';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'tableId', 'tableNumberSnapshot', 'requestedAt', 'status', 'handledById', 'handledAt', 'acknowledgedAt', 'resolvedAt'
    ];

    protected $casts = [
        'requestedAt' => 'datetime',
        'handledAt' => 'datetime',
        'acknowledgedAt' => 'datetime',
        'resolvedAt' => 'datetime',
    ];

    public function table() { return $this->belongsTo(RestaurantTable::class, 'tableId'); }
    public function handledBy() { return $this->belongsTo(Staff::class, 'handledById'); }
}
