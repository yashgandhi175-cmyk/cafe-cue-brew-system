<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerTag extends Model
{
    protected $table = 'CustomerTag';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'name', 'description', 'isActive'
    ];

    protected $casts = [
        'isActive' => 'boolean',
    ];

    public function assignments() { return $this->hasMany(CustomerTagAssignment::class, 'tagId'); }
}
