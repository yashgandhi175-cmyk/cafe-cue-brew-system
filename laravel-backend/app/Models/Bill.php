<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Bill extends Model
{
    protected $table = 'Bill';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'invoiceNumber', 'orderId', 'status', 'paymentStatus', 'subtotal', 'discount', 'itemDiscount', 'couponDiscount', 'manualDiscount', 'totalDiscount', 'manualDiscountType', 'manualDiscountValue', 'manualDiscountReason', 'manualDiscountAppliedBy', 'taxableAmount', 'cgst', 'sgst', 'serviceCharge', 'nightCharge', 'preRoundGrandTotal', 'roundOff', 'grandTotal', 'gstRateSnapshot', 'cgstRateSnapshot', 'sgstRateSnapshot', 'taxInclusiveSnapshot', 'serviceChargeRateSnapshot', 'nightChargeTypeSnapshot', 'nightChargeValueSnapshot', 'loyaltyDiscount', 'loyaltyEligibleAmount', 'activeRedemptionRequestId', 'appliedCouponId', 'appliedCouponCode', 'financialVersion', 'finalizedAt', 'tableSessionId'
    ];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'discount' => 'decimal:2',
        'itemDiscount' => 'decimal:2',
        'couponDiscount' => 'decimal:2',
        'manualDiscount' => 'decimal:2',
        'totalDiscount' => 'decimal:2',
        'manualDiscountValue' => 'decimal:2',
        'taxableAmount' => 'decimal:2',
        'cgst' => 'decimal:2',
        'sgst' => 'decimal:2',
        'serviceCharge' => 'decimal:2',
        'nightCharge' => 'decimal:2',
        'preRoundGrandTotal' => 'decimal:2',
        'roundOff' => 'decimal:2',
        'grandTotal' => 'decimal:2',
        'gstRateSnapshot' => 'decimal:2',
        'cgstRateSnapshot' => 'decimal:2',
        'sgstRateSnapshot' => 'decimal:2',
        'taxInclusiveSnapshot' => 'boolean',
        'serviceChargeRateSnapshot' => 'decimal:2',
        'nightChargeValueSnapshot' => 'decimal:2',
        'loyaltyDiscount' => 'decimal:2',
        'loyaltyEligibleAmount' => 'decimal:2',
        'financialVersion' => 'integer',
        'finalizedAt' => 'datetime',
    ];

    public function tableSession() { return $this->belongsTo(TableSession::class, 'tableSessionId'); }
    public function order() { return $this->belongsTo(Order::class, 'orderId'); }
    public function payments() { return $this->hasMany(Payment::class, 'billId'); }
    public function activeRedemptionRequest() { return $this->belongsTo(LoyaltyRedemptionRequest::class, 'activeRedemptionRequestId'); }
    public function loyaltyTransactions() { return $this->hasMany(LoyaltyTransaction::class, 'billId'); }
    public function loyaltyRedemptionRequests() { return $this->hasMany(LoyaltyRedemptionRequest::class, 'billId'); }
    public function couponUsage() { return $this->hasOne(CouponUsage::class, 'billId'); }
}
