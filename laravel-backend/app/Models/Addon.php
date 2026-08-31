<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Addon extends Model
{
    protected $table = 'Addon';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'name', 'price', 'isActive'
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'isActive' => 'boolean',
    ];

    public function menuItemAddons() { return $this->hasMany(MenuItemAddon::class, 'addonId'); }
    public function recipes() { return $this->hasMany(Recipe::class, 'addonId'); }
}
