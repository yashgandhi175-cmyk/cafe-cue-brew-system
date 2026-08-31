<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoyaltyRedemptionRequest extends Model
{
    protected $table = 'LoyaltyRedemptionRequest';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'billId', 'customerId', 'requestedPoints', 'approvedPoints', 'status', 'expiresAt', 'expiredAt', 'approvedAt', 'approvedByStaffId', 'rejectedAt', 'rejectedByStaffId', 'cancelledAt'
    ];

    protected $casts = [
        'requestedPoints' => 'integer',
        'approvedPoints' => 'integer',
        'expiresAt' => 'datetime',
        'expiredAt' => 'datetime',
        'approvedAt' => 'datetime',
        'rejectedAt' => 'datetime',
        'cancelledAt' => 'datetime',
    ];

    public function bill() { return $this->belongsTo(Bill::class, 'billId'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customerId'); }
    public function approvedBy() { return $this->belongsTo(Staff::class, 'approvedByStaffId'); }
    public function rejectedBy() { return $this->belongsTo(Staff::class, 'rejectedByStaffId'); }
    public function activeBill() { return $this->hasOne(Bill::class, 'activeRedemptionRequestId'); }
    public function loyaltyTransactions() { return $this->hasMany(LoyaltyTransaction::class, 'redemptionRequestId'); }
}
