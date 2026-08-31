<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerCart extends Model
{
    protected $table = 'CustomerCart';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'tableId'
    ];

    public function items() { return $this->hasMany(CustomerCartItem::class, 'cartId'); }
}
