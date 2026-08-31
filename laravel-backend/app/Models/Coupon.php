<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Coupon extends Model
{
    protected $table = 'Coupon';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'code', 'type', 'value', 'minOrder', 'maxDiscount', 'startDate', 'endDate', 'usageLimit', 'perCustLimit', 'isActive', 'name', 'description', 'usedCount', 'createdByStaffId'
    ];

    protected $casts = [
        'value' => 'decimal:2',
        'minOrder' => 'decimal:2',
        'maxDiscount' => 'decimal:2',
        'startDate' => 'datetime',
        'endDate' => 'datetime',
        'usageLimit' => 'integer',
        'perCustLimit' => 'integer',
        'isActive' => 'boolean',
        'usedCount' => 'integer',
    ];

    public function couponUsages() { return $this->hasMany(CouponUsage::class, 'couponId'); }
    public function createdBy() { return $this->belongsTo(Staff::class, 'createdByStaffId'); }
    public function customerCouponUsageCounters() { return $this->hasMany(CustomerCouponUsageCounter::class, 'couponId'); }
    public function banners() { return $this->hasMany(Banner::class, 'targetCouponId'); }
    public function campaigns() { return $this->hasMany(Campaign::class, 'couponId'); }
}
