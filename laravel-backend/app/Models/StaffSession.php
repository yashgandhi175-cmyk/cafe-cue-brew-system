<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StaffSession extends Model
{
    protected $table = 'StaffSession';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'lastUsedAt';

    protected $fillable = [
        'id', 'staffId', 'token', 'expiredAt', 'userAgent', 'ipAddress', 'isActive', 'lastUsedAt'
    ];

    protected $hidden = [
        'token'
    ];

    protected $casts = [
        'expiredAt' => 'datetime',
        'lastUsedAt' => 'datetime',
        'isActive' => 'boolean',
    ];

    public function staff() { return $this->belongsTo(Staff::class, 'staffId'); }
}
