<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $table = 'Notification';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'type', 'message', 'isRead', 'createdAt'
    ];

    protected $casts = [
        'isRead' => 'boolean',
        'createdAt' => 'datetime',
    ];
}
