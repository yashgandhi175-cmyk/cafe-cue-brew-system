<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StaffLoginHistory extends Model
{
    protected $table = 'StaffLoginHistory';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id', 'staffId', 'status', 'failureReason', 'ipAddress', 'createdAt'
    ];

    protected $casts = [
        'createdAt' => 'datetime',
    ];

    public function staff() { return $this->belongsTo(Staff::class, 'staffId'); }
}
