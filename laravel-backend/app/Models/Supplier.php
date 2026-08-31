<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Supplier extends Model
{
    protected $table = 'Supplier';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'name', 'contactPerson', 'phone', 'email', 'gstin', 'address', 'notes', 'isActive'
    ];

    protected $casts = [
        'isActive' => 'boolean',
    ];

    public function ingredients() { return $this->hasMany(Ingredient::class, 'preferredSupplierId'); }
    public function purchases() { return $this->hasMany(Purchase::class, 'supplierId'); }
}
