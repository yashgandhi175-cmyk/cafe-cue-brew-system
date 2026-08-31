<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketingQueueJob extends Model
{
    protected $table = 'MarketingQueueJob';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'campaignId', 'customerId', 'recipientAddress', 'payload', 'status', 'attempts', 'runAfter', 'lockedAt', 'errorLog'
    ];

    protected $casts = [
        'payload' => 'array',
        'attempts' => 'integer',
        'runAfter' => 'datetime',
        'lockedAt' => 'datetime',
    ];

    public function campaign() { return $this->belongsTo(Campaign::class, 'campaignId'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customerId'); }
}
