<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerTagAssignment extends Model
{
    protected $table = 'CustomerTagAssignment';
    public $incrementing = false;
    protected $primaryKey = null;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'customerId', 'tagId', 'assignedById', 'assignedAt'
    ];

    protected $casts = [
        'assignedAt' => 'datetime',
    ];

    public function customer() { return $this->belongsTo(Customer::class, 'customerId'); }
    public function tag() { return $this->belongsTo(CustomerTag::class, 'tagId'); }
    public function assignedBy() { return $this->belongsTo(Staff::class, 'assignedById'); }
}
