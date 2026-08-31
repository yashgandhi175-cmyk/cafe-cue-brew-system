<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerCouponUsageCounter extends Model
{
    protected $table = 'CustomerCouponUsageCounter';
    public $incrementing = false;
    protected $primaryKey = null;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'couponId', 'customerId', 'usageCount', 'version'
    ];

    protected $casts = [
        'usageCount' => 'integer',
        'version' => 'integer',
    ];

    public function coupon() { return $this->belongsTo(Coupon::class, 'couponId'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customerId'); }
}
