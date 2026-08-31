<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerIdentityConflictMember extends Model
{
    protected $table = 'CustomerIdentityConflictMember';
    public $incrementing = false;
    protected $primaryKey = null;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'conflictId', 'customerId', 'originalPhone', 'createdAt'
    ];

    protected $casts = [
        'createdAt' => 'datetime',
    ];

    public function conflict() { return $this->belongsTo(CustomerIdentityConflict::class, 'conflictId'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customerId'); }
}
