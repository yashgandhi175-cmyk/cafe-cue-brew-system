<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Bill;
use App\Models\Coupon;
use App\Models\InvoiceSequence;
use App\Models\RestaurantSettings;
use App\Models\AuditLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BillingService
{
    protected $calcService;

    public function __construct(FinancialCalculationService $calcService)
    {
        $this->calcService = $calcService;
    }

    public function getBillForOrder(string $orderId): Bill
    {
        $bill = Bill::where('orderId', $orderId)->first();
        if ($bill) {
            return $bill;
        }

        $order = Order::find($orderId);
        if (!$order) {
            throw new \Exception('Order not found.', 404);
        }

        $settings = RestaurantSettings::find('default');
        $calc = $this->calcService->calculate([
            'subtotal' => (float)$order->subtotal,
            'manualDiscount' => (float)$order->discount,
            'couponDiscount' => (float)$order->couponDiscount,
            'settings' => $settings,
        ]);

        return Bill::create([
            'id' => (string)Str::uuid(),
            'orderId' => $orderId,
            'status' => 'DRAFT',
            'subtotal' => $calc['subtotal'],
            'discount' => $calc['discount'],
            'manualDiscount' => (float)$order->discount,
            'couponDiscount' => (float)$order->couponDiscount,
            'totalDiscount' => $calc['discount'],
            'taxableAmount' => $calc['taxableAmount'],
            'cgst' => $calc['cgst'],
            'sgst' => $calc['sgst'],
            'serviceCharge' => $calc['serviceCharge'],
            'nightCharge' => $calc['nightCharge'],
            'roundOff' => $calc['roundOff'],
            'grandTotal' => $calc['grandTotal'],
            'createdAt' => now(),
        ]);
    }

    public function applyManualDiscount(string $orderId, string $staffId, string $staffRole, array $dto): Bill
    {
        if ($staffRole === 'WAITER') {
            throw new \Exception('Waiters are not authorized to apply manual discounts.', 403);
        }

        $reason = trim($dto['reason'] ?? '');
        if (empty($reason)) {
            throw new \Exception('A reason is required to apply manual discounts.', 400);
        }

        $value = (float)($dto['value'] ?? 0);
        if ($value < 0) {
            throw new \Exception('Discount value cannot be negative.', 400);
        }

        return DB::transaction(function () use ($orderId, $staffId, $staffRole, $dto, $reason, $value) {
            $order = Order::find($orderId);
            if (!$order) {
                throw new \Exception('Order not found.', 404);
            }

            if (in_array($order->status, ['CANCELLED', 'VOIDED'])) {
                throw new \Exception('Cannot apply discount to a cancelled or voided order.', 400);
            }

            $settings = RestaurantSettings::find('default');
            if (!$settings) {
                throw new \Exception('Restaurant settings not found.', 404);
            }

            $cashierMax = (float)($settings->cashierMaxDiscountPercent ?? 10.0);
            $managerMax = (float)($settings->managerMaxDiscountPercent ?? 25.0);

            $subtotalNum = (float)$order->subtotal;
            $discountPercent = 0.0;
            $type = $dto['type'] ?? 'FLAT';

            if ($type === 'PERCENTAGE') {
                $discountPercent = $value;
            } else {
                $discountPercent = $subtotalNum > 0 ? ($value / $subtotalNum) * 100 : 0;
            }

            if ($type === 'PERCENTAGE' && $value > 100) {
                throw new \Exception('Percentage discount cannot exceed 100%.', 400);
            }

            if ($staffRole === 'CASHIER' && $discountPercent > $cashierMax) {
                throw new \Exception("Cashiers are limited to a maximum {$cashierMax}% manual discount.", 403);
            }
            if ($staffRole === 'MANAGER' && $discountPercent > $managerMax) {
                throw new \Exception("Managers are limited to a maximum {$managerMax}% manual discount.", 403);
            }

            $bill = Bill::where('orderId', $orderId)->where('status', 'DRAFT')->first();
            if (!$bill) {
                $bill = $this->getBillForOrder($orderId);
            }

            $manualDiscountAmount = 0.0;
            if ($type === 'FLAT') {
                $manualDiscountAmount = $value;
            } else {
                $manualDiscountAmount = round(($subtotalNum * $value) / 100, 2);
            }

            if ($manualDiscountAmount > $subtotalNum) {
                throw new \Exception('Manual discount cannot exceed subtotal.', 400);
            }

            $calcResult = $this->calcService->calculate([
                'subtotal' => $subtotalNum,
                'manualDiscount' => $manualDiscountAmount,
                'couponDiscount' => (float)$order->couponDiscount,
                'settings' => $settings,
            ]);

            $bill->manualDiscount = $calcResult['manualDiscount'];
            $bill->manualDiscountType = $type;
            $bill->manualDiscountValue = $value;
            $bill->manualDiscountReason = $reason;
            $bill->manualDiscountAppliedBy = $staffId;
            $bill->discount = $calcResult['discount'];
            $bill->totalDiscount = $calcResult['discount'];
            $bill->taxableAmount = $calcResult['taxableAmount'];
            $bill->cgst = $calcResult['cgst'];
            $bill->sgst = $calcResult['sgst'];
            $bill->serviceCharge = $calcResult['serviceCharge'];
            $bill->nightCharge = $calcResult['nightCharge'];
            $bill->preRoundGrandTotal = $calcResult['preRoundGrandTotal'];
            $bill->roundOff = $calcResult['roundOff'];
            $bill->grandTotal = $calcResult['grandTotal'];
            $bill->save();

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staffId,
                'action' => 'DISCOUNT_APPLY',
                'entityType' => 'Bill',
                'entityId' => $bill->id,
                'newData' => json_encode([
                    'discountType' => $type,
                    'discountValue' => $value,
                    'calculatedAmount' => $calcResult['manualDiscount'],
                    'reason' => $reason,
                ]),
                'createdAt' => now(),
            ]);

            return $bill;
        });
    }

    public function finalizeBill(string $orderId, string $staffId): Bill
    {
        return DB::transaction(function () use ($orderId, $staffId) {
            $order = Order::find($orderId);
            if (!$order) {
                throw new \Exception('Order not found.', 404);
            }

            if (in_array($order->status, ['CANCELLED', 'VOIDED'])) {
                throw new \Exception('Cannot finalize bill for a cancelled or voided order.', 400);
            }

            $settings = RestaurantSettings::find('default');
            if (!$settings) {
                throw new \Exception('Restaurant settings not found.', 404);
            }

            $existingFinalized = Bill::where('orderId', $orderId)
                ->whereIn('status', ['FINALIZED', 'PAID', 'VOIDED'])
                ->first();

            if ($existingFinalized) {
                return $existingFinalized;
            }

            $bill = Bill::where('orderId', $orderId)->where('status', 'DRAFT')->first();
            if (!$bill) {
                $bill = $this->getBillForOrder($orderId);
            }

            $calcResult = $this->calcService->calculate([
                'subtotal' => (float)$order->subtotal,
                'manualDiscount' => (float)$bill->manualDiscount,
                'couponDiscount' => (float)$bill->couponDiscount,
                'settings' => $settings,
            ]);

            // Sequence-safe invoice number generation
            $year = (int)date('Y');
            $prefix = $settings->invoicePrefix ?? 'CCB';

            $seq = InvoiceSequence::firstOrCreate(
                ['year' => $year, 'prefix' => $prefix],
                ['id' => (string)Str::uuid(), 'lastNumber' => 0]
            );
            $seq->increment('lastNumber');

            $sequenceStr = str_pad((string)$seq->lastNumber, 6, '0', STR_PAD_LEFT);
            $invoiceNumber = "{$prefix}-{$year}-{$sequenceStr}";

            $bill->invoiceNumber = $invoiceNumber;
            $bill->status = 'FINALIZED';
            $bill->discount = $calcResult['discount'];
            $bill->totalDiscount = $calcResult['discount'];
            $bill->taxableAmount = $calcResult['taxableAmount'];
            $bill->cgst = $calcResult['cgst'];
            $bill->sgst = $calcResult['sgst'];
            $bill->serviceCharge = $calcResult['serviceCharge'];
            $bill->nightCharge = $calcResult['nightCharge'];
            $bill->preRoundGrandTotal = $calcResult['preRoundGrandTotal'];
            $bill->roundOff = $calcResult['roundOff'];
            $bill->grandTotal = $calcResult['grandTotal'];
            $bill->finalizedAt = now();
            $bill->save();

            // Sync to Order
            $order->discount = $calcResult['discount'];
            $order->taxableAmount = $calcResult['taxableAmount'];
            $order->cgst = $calcResult['cgst'];
            $order->sgst = $calcResult['sgst'];
            $order->serviceCharge = $calcResult['serviceCharge'];
            $order->nightCharge = $calcResult['nightCharge'];
            $order->roundOff = $calcResult['roundOff'];
            $order->grandTotal = $calcResult['grandTotal'];
            $order->save();

            return $bill;
        });
    }

    public function validateCoupon(string $code, float $subtotal, ?string $customerId = null): array
    {
        $cleanCode = strtoupper(trim($code));
        $coupon = Coupon::where('code', $cleanCode)->where('isActive', true)->first();

        if (!$coupon) {
            throw new \Exception('Invalid or expired coupon code.', 404);
        }

        $now = now();
        if ($coupon->startDate && strtotime($coupon->startDate) > time()) {
            throw new \Exception('Coupon is not active yet.', 400);
        }
        if ($coupon->endDate && strtotime($coupon->endDate) < time()) {
            throw new \Exception('Coupon has expired.', 400);
        }

        if ($coupon->minOrder && $subtotal < (float)$coupon->minOrder) {
            throw new \Exception("Minimum order subtotal of ₹{$coupon->minOrder} is required for this coupon.", 400);
        }

        if ($coupon->usageLimit && $coupon->usedCount >= $coupon->usageLimit) {
            throw new \Exception('Coupon usage limit has been reached.', 400);
        }

        $discountAmount = 0.0;
        if ($coupon->type === 'PERCENTAGE') {
            $discountAmount = round(($subtotal * (float)$coupon->value) / 100, 2);
            if ($coupon->maxDiscount && $discountAmount > (float)$coupon->maxDiscount) {
                $discountAmount = (float)$coupon->maxDiscount;
            }
        } else {
            $discountAmount = (float)$coupon->value;
        }

        if ($discountAmount > $subtotal) {
            $discountAmount = $subtotal;
        }

        return [
            'valid' => true,
            'couponId' => $coupon->id,
            'code' => $coupon->code,
            'discountType' => $coupon->type,
            'discountValue' => (float)$coupon->value,
            'discountAmount' => $discountAmount,
        ];
    }
}
