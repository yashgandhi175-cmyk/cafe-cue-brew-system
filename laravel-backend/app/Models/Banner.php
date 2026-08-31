<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Banner extends Model
{
    protected $table = 'Banner';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'image', 'title', 'subtitle', 'buttonText', 'buttonAction', 'startDate', 'endDate', 'priority', 'isActive', 'targetAction', 'targetCouponId', 'targetMenuItemId', 'targetCategoryId'
    ];

    protected $casts = [
        'startDate' => 'datetime',
        'endDate' => 'datetime',
        'priority' => 'integer',
        'isActive' => 'boolean',
    ];

    public function targetCoupon() { return $this->belongsTo(Coupon::class, 'targetCouponId'); }
    public function targetMenuItem() { return $this->belongsTo(MenuItem::class, 'targetMenuItemId'); }
    public function targetCategory() { return $this->belongsTo(Category::class, 'targetCategoryId'); }
}
