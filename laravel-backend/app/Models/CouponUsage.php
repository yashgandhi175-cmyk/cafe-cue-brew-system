<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CouponUsage extends Model
{
    protected $table = 'CouponUsage';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'couponId', 'orderId', 'customerId', 'billId', 'couponCodeSnapshot', 'couponNameSnapshot', 'discountTypeSnapshot', 'discountValueSnapshot', 'maximumDiscountSnapshot', 'appliedDiscountSnapshot', 'status', 'createdAt', 'reversedAt'
    ];

    protected $casts = [
        'discountValueSnapshot' => 'decimal:2',
        'maximumDiscountSnapshot' => 'decimal:2',
        'appliedDiscountSnapshot' => 'decimal:2',
        'createdAt' => 'datetime',
        'reversedAt' => 'datetime',
    ];

    public function coupon() { return $this->belongsTo(Coupon::class, 'couponId'); }
    public function order() { return $this->belongsTo(Order::class, 'orderId'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customerId'); }
    public function bill() { return $this->belongsTo(Bill::class, 'billId'); }
}
