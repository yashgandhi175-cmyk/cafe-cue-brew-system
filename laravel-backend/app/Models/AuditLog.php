<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $table = 'AuditLog';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id', 'staffId', 'action', 'entityType', 'entityId', 'oldData', 'newData', 'ipAddress', 'createdAt'
    ];

    protected $casts = [
        'createdAt' => 'datetime',
    ];

    public function staff() { return $this->belongsTo(Staff::class, 'staffId'); }
}
