<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoyaltyTransaction extends Model
{
    protected $table = 'LoyaltyTransaction';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'customerId', 'type', 'pointsChange', 'balanceAfter', 'billId', 'orderId', 'redemptionRequestId', 'referenceType', 'referenceId', 'reason', 'eligibleAmountSnapshot', 'earnSpendAmountSnapshot', 'earnPointsSnapshot', 'redemptionValueSnapshot', 'redemptionPointsSnapshot', 'idempotencyKey', 'createdByStaffId', 'createdAt'
    ];

    protected $casts = [
        'pointsChange' => 'integer',
        'balanceAfter' => 'integer',
        'eligibleAmountSnapshot' => 'decimal:2',
        'earnSpendAmountSnapshot' => 'decimal:2',
        'earnPointsSnapshot' => 'integer',
        'redemptionValueSnapshot' => 'decimal:2',
        'redemptionPointsSnapshot' => 'integer',
        'createdAt' => 'datetime',
    ];

    public function customer() { return $this->belongsTo(Customer::class, 'customerId'); }
    public function bill() { return $this->belongsTo(Bill::class, 'billId'); }
    public function order() { return $this->belongsTo(Order::class, 'orderId'); }
    public function redemptionRequest() { return $this->belongsTo(LoyaltyRedemptionRequest::class, 'redemptionRequestId'); }
    public function createdBy() { return $this->belongsTo(Staff::class, 'createdByStaffId'); }
}
