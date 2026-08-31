<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    protected $table = 'Attendance';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'staffId', 'clockIn', 'clockOut', 'duration', 'createdAt'
    ];

    protected $casts = [
        'clockIn' => 'datetime',
        'clockOut' => 'datetime',
        'duration' => 'integer',
        'createdAt' => 'datetime',
    ];

    public function staff() { return $this->belongsTo(Staff::class, 'staffId'); }
}
