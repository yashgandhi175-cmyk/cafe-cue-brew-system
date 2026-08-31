<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TableSession extends Model
{
    protected $table = 'TableSession';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'tableId', 'status', 'createdAt', 'closedAt'
    ];

    protected $casts = [
        'createdAt' => 'datetime',
        'closedAt' => 'datetime',
    ];

    public function table() { return $this->belongsTo(RestaurantTable::class, 'tableId'); }
    public function orders() { return $this->hasMany(Order::class, 'tableSessionId'); }
    public function bills() { return $this->hasMany(Bill::class, 'tableSessionId'); }
}
