<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TableQrToken extends Model
{
    protected $table = 'TableQrToken';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'tableId', 'token', 'createdAt'
    ];

    protected $casts = [
        'createdAt' => 'datetime',
    ];

    public function table() { return $this->belongsTo(RestaurantTable::class, 'tableId'); }
}
