<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $table = 'Order';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'orderNumber', 'publicTrackingToken', 'idempotencyKey', 'customerId', 'tableId', 'tableNumberSnapshot', 'source', 'status', 'paymentStatus', 'subtotal', 'discount', 'couponDiscount', 'taxableAmount', 'cgst', 'sgst', 'serviceCharge', 'nightCharge', 'roundOff', 'grandTotal', 'couponCode', 'createdById', 'notes', 'inventoryDeducted', 'cancellationReason', 'cancelledById', 'cancelledAt', 'tableSessionId'
    ];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'discount' => 'decimal:2',
        'couponDiscount' => 'decimal:2',
        'taxableAmount' => 'decimal:2',
        'cgst' => 'decimal:2',
        'sgst' => 'decimal:2',
        'serviceCharge' => 'decimal:2',
        'nightCharge' => 'decimal:2',
        'roundOff' => 'decimal:2',
        'grandTotal' => 'decimal:2',
        'inventoryDeducted' => 'boolean',
        'cancelledAt' => 'datetime',
    ];

    public function tableSession() { return $this->belongsTo(TableSession::class, 'tableSessionId'); }
    public function customer() { return $this->belongsTo(Customer::class, 'customerId'); }
    public function table() { return $this->belongsTo(RestaurantTable::class, 'tableId'); }
    public function createdBy() { return $this->belongsTo(Staff::class, 'createdById'); }
    public function items() { return $this->hasMany(OrderItem::class, 'orderId'); }
    public function statusHistory() { return $this->hasMany(OrderStatusHistory::class, 'orderId'); }
    public function bills() { return $this->hasMany(Bill::class, 'orderId'); }
    public function payments() { return $this->hasMany(Payment::class, 'orderId'); }
    public function couponUsages() { return $this->hasMany(CouponUsage::class, 'orderId'); }
    public function stockConsumption() { return $this->hasOne(OrderStockConsumption::class, 'orderId'); }
    public function stockConsumptionReversal() { return $this->hasOne(OrderStockConsumptionReversal::class, 'orderId'); }
    public function loyaltyTransactions() { return $this->hasMany(LoyaltyTransaction::class, 'orderId'); }
}
