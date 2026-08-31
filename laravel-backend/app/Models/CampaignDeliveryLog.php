<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CampaignDeliveryLog extends Model
{
    protected $table = 'CampaignDeliveryLog';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'campaignId', 'customerId', 'recipientAddress', 'messageSid', 'status', 'errorCode', 'sentAt', 'deliveredAt', 'readAt', 'createdAt'
    ];

    protected $casts = [
        'sentAt' => 'datetime',
        'deliveredAt' => 'datetime',
        'readAt' => 'datetime',
        'createdAt' => 'datetime',
    ];

    public function campaign() { return $this->belongsTo(Campaign::class, 'campaignId'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customerId'); }
}
