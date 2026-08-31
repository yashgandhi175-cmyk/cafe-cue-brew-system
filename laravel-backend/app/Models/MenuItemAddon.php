<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MenuItemAddon extends Model
{
    protected $table = 'MenuItemAddon';
    public $incrementing = false;
    protected $primaryKey = null;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'menuItemId', 'addonId'
    ];

    public function menuItem() { return $this->belongsTo(MenuItem::class, 'menuItemId'); }
    public function addon() { return $this->belongsTo(Addon::class, 'addonId'); }
}
