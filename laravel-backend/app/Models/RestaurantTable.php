<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RestaurantTable extends Model
{
    protected $table = 'RestaurantTable';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'tableNumber', 'capacity', 'status', 'isActive'
    ];

    protected $casts = [
        'capacity' => 'integer',
        'isActive' => 'boolean',
    ];

    public function orders() { return $this->hasMany(Order::class, 'tableId'); }
    public function waiterCalls() { return $this->hasMany(WaiterCall::class, 'tableId'); }
    public function qrToken() { return $this->hasOne(TableQrToken::class, 'tableId'); }
    public function tableSessions() { return $this->hasMany(TableSession::class, 'tableId'); }
}
