<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Campaign extends Model
{
    protected $table = 'Campaign';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'name', 'type', 'status', 'templateId', 'templateVariables', 'targetSegmentRule', 'couponId', 'scheduledAt', 'createdByStaffId'
    ];

    protected $casts = [
        'templateVariables' => 'array',
        'targetSegmentRule' => 'array',
        'scheduledAt' => 'datetime',
    ];

    public function coupon() { return $this->belongsTo(Coupon::class, 'couponId'); }
    public function createdBy() { return $this->belongsTo(Staff::class, 'createdByStaffId'); }
    public function queueJobs() { return $this->hasMany(MarketingQueueJob::class, 'campaignId'); }
    public function deliveryLogs() { return $this->hasMany(CampaignDeliveryLog::class, 'campaignId'); }
}
