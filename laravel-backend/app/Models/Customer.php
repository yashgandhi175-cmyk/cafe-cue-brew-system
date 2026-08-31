<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    protected $table = 'Customer';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'name', 'phone', 'email', 'birthday', 'anniversary', 'marketingConsent', 'marketingConsentAt', 'marketingConsentSource', 'marketingOptOutAt', 'loyaltyPoints', 'notes', 'status', 'whatsappConsent', 'emailConsent', 'whatsappOptOutAt', 'visitCount', 'totalSpending'
    ];

    protected $casts = [
        'birthday' => 'datetime',
        'anniversary' => 'datetime',
        'marketingConsent' => 'boolean',
        'marketingConsentAt' => 'datetime',
        'marketingOptOutAt' => 'datetime',
        'loyaltyPoints' => 'integer',
        'whatsappConsent' => 'boolean',
        'emailConsent' => 'boolean',
        'whatsappOptOutAt' => 'datetime',
        'visitCount' => 'integer',
        'totalSpending' => 'decimal:2',
    ];

    public function orders() { return $this->hasMany(Order::class, 'customerId'); }
    public function couponUsages() { return $this->hasMany(CouponUsage::class, 'customerId'); }
    public function tagAssignments() { return $this->hasMany(CustomerTagAssignment::class, 'customerId'); }
    public function identityConflicts() { return $this->hasMany(CustomerIdentityConflictMember::class, 'customerId'); }
    public function loyaltyTransactions() { return $this->hasMany(LoyaltyTransaction::class, 'customerId'); }
    public function loyaltyRedemptionRequests() { return $this->hasMany(LoyaltyRedemptionRequest::class, 'customerId'); }
    public function customerCouponUsageCounters() { return $this->hasMany(CustomerCouponUsageCounter::class, 'customerId'); }
    public function queueJobs() { return $this->hasMany(MarketingQueueJob::class, 'customerId'); }
    public function deliveryLogs() { return $this->hasMany(CampaignDeliveryLog::class, 'customerId'); }
    public function creditLedgers() { return $this->hasMany(CreditLedger::class, 'customerId'); }
}
