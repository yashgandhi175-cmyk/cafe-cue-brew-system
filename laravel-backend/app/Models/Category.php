<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Category extends Model
{
    protected $table = 'Category';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'name', 'image', 'displayOrder', 'isActive'
    ];

    protected $casts = [
        'displayOrder' => 'integer',
        'isActive' => 'boolean',
    ];

    public function menuItems() { return $this->hasMany(MenuItem::class, 'categoryId'); }
    public function banners() { return $this->hasMany(Banner::class, 'targetCategoryId'); }
}
