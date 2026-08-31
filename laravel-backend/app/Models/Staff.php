<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Staff extends Model
{
    protected $table = 'Staff';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id', 'name', 'phone', 'role', 'pinHash', 'mustChangePin', 'status', 'failedAttempts', 'lockedUntil', 'lastLogin'
    ];

    protected $hidden = [
        'pinHash'
    ];

    protected $casts = [
        'mustChangePin' => 'boolean',
        'failedAttempts' => 'integer',
        'lockedUntil' => 'datetime',
        'lastLogin' => 'datetime',
    ];

    public function sessions() { return $this->hasMany(StaffSession::class, 'staffId'); }
    public function loginHistories() { return $this->hasMany(StaffLoginHistory::class, 'staffId'); }
    public function attendances() { return $this->hasMany(Attendance::class, 'staffId'); }
    public function ordersCreated() { return $this->hasMany(Order::class, 'createdById'); }
    public function orderStatusChanges() { return $this->hasMany(OrderStatusHistory::class, 'changedById'); }
    public function paymentsReceived() { return $this->hasMany(Payment::class, 'receivedById'); }
    public function stockTransactions() { return $this->hasMany(StockTransaction::class, 'changedById'); }
    public function expenses() { return $this->hasMany(Expense::class, 'createdById'); }
    public function purchasesCreated() { return $this->hasMany(Purchase::class, 'createdById'); }
    public function wastageEntries() { return $this->hasMany(WastageEntry::class, 'recordedById'); }
    public function auditLogs() { return $this->hasMany(AuditLog::class, 'staffId'); }
    public function waiterCallsHandled() { return $this->hasMany(WaiterCall::class, 'handledById'); }
    public function createdCoupons() { return $this->hasMany(Coupon::class, 'createdByStaffId'); }
    public function campaignsCreated() { return $this->hasMany(Campaign::class, 'createdByStaffId'); }
    public function creditLedgersCreated() { return $this->hasMany(CreditLedger::class, 'createdById'); }
    public function creditLedgersUpdated() { return $this->hasMany(CreditLedger::class, 'updatedById'); }
    public function creditPaymentsReceived() { return $this->hasMany(CreditPayment::class, 'receivedById'); }
}
