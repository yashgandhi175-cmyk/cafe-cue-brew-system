<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Purchase extends Model
{
    protected $table = 'Purchase';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'purchaseNumber', 'supplierId', 'invoiceNumber', 'invoiceDate', 'purchaseDate', 'status', 'subtotal', 'discount', 'tax', 'otherCharges', 'grandTotal', 'notes', 'createdById'
    ];

    protected $casts = [
        'invoiceDate' => 'datetime',
        'purchaseDate' => 'datetime',
        'subtotal' => 'decimal:2',
        'discount' => 'decimal:2',
        'tax' => 'decimal:2',
        'otherCharges' => 'decimal:2',
        'grandTotal' => 'decimal:2',
    ];

    public function supplier() { return $this->belongsTo(Supplier::class, 'supplierId'); }
    public function createdBy() { return $this->belongsTo(Staff::class, 'createdById'); }
    public function items() { return $this->hasMany(PurchaseItem::class, 'purchaseId'); }
}
