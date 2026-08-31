<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CampaignTemplate extends Model
{
    protected $table = 'CampaignTemplate';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'externalIdentifier', 'type', 'name', 'contentPattern', 'variableSpecs', 'language', 'isActive'
    ];

    protected $casts = [
        'variableSpecs' => 'array',
        'isActive' => 'boolean',
    ];
}
