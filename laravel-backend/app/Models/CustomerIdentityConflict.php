<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerIdentityConflict extends Model
{
    protected $table = 'CustomerIdentityConflict';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'normalizedPhone', 'status', 'reason', 'resolvedAt', 'resolvedByStaffId', 'resolutionNote'
    ];

    protected $casts = [
        'resolvedAt' => 'datetime',
    ];

    public function members() { return $this->hasMany(CustomerIdentityConflictMember::class, 'conflictId'); }
    public function resolvedBy() { return $this->belongsTo(Staff::class, 'resolvedByStaffId'); }
}
