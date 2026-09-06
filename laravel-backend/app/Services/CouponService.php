<?php

namespace App\Services;

use App\Models\Coupon;
use App\Models\CouponUsage;
use App\Models\CustomerCouponUsageCounter;
use Illuminate\Support\Str;

class CouponService
{
    /**
     * Validate a coupon and calculate the server-side discount.
     *
     * This method does NOT record usage.
     * Usage is recorded only after a bill is successfully finalized.
     */
    public function validate(
        string $code,
        float $subtotal,
        ?string $customerId = null
    ): array {
        $cleanCode = strtoupper(trim($code));
        $subtotal = round(max(0, $subtotal), 2);

        if ($cleanCode === '') {
            throw new \Exception('Coupon code is required.', 400);
        }

        $coupon = Coupon::where('code', $cleanCode)
            ->where('isActive', true)
            ->first();

        if (!$coupon) {
            throw new \Exception('Invalid or expired coupon code.', 404);
        }

        $now = now();

        if ($coupon->startDate && $now->lt($coupon->startDate)) {
            throw new \Exception('Coupon is not active yet.', 400);
        }

        if ($coupon->endDate && $now->gt($coupon->endDate)) {
            throw new \Exception('Coupon has expired.', 400);
        }

        $minOrder = (float) ($coupon->minOrder ?? 0);

        if ($subtotal < $minOrder) {
            throw new \Exception(
                'Minimum order subtotal of Rs. ' .
                number_format($minOrder, 2) .
                ' is required for this coupon.',
                400
            );
        }

        $usageLimit = (int) ($coupon->usageLimit ?? 0);
        $usedCount = (int) ($coupon->usedCount ?? 0);

        if ($usageLimit > 0 && $usedCount >= $usageLimit) {
            throw new \Exception('Coupon usage limit has been reached.', 400);
        }

        if ($customerId) {
            $perCustomerLimit = (int) ($coupon->perCustLimit ?? 0);

            if ($perCustomerLimit > 0) {
                $customerUsage = CustomerCouponUsageCounter::where(
                    'couponId',
                    $coupon->id
                )
                    ->where('customerId', $customerId)
                    ->first();

                $customerUsedCount = $customerUsage
                    ? (int) $customerUsage->usageCount
                    : 0;

                if ($customerUsedCount >= $perCustomerLimit) {
                    throw new \Exception(
                        'You have reached the usage limit for this coupon.',
                        400
                    );
                }
            }
        }

        $discountAmount = $this->calculateDiscount($coupon, $subtotal);

        return [
            'valid' => true,

            // Coupon identity
            'couponId' => $coupon->id,
            'normalizedCode' => $coupon->code,
            'code' => $coupon->code,

            // Coupon definition
            'name' => $coupon->name,
            'description' => $coupon->description,
            'discountType' => $coupon->type,
            'discountValue' => (float) $coupon->value,
            'maximumDiscount' => $coupon->maxDiscount !== null
                ? (float) $coupon->maxDiscount
                : null,

            // Calculated server-side amount
            'discountAmount' => $discountAmount,
            'appliedDiscountEstimate' => $discountAmount,
        ];
    }

    /**
     * Calculate discount without recording usage.
     */
    public function calculateDiscount(Coupon $coupon, float $subtotal): float
    {
        $value = (float) $coupon->value;
        $discount = 0.0;

        if ($coupon->type === 'PERCENTAGE') {
            $discount = round(($subtotal * $value) / 100, 2);

            $maxDiscount = $coupon->maxDiscount !== null
                ? (float) $coupon->maxDiscount
                : null;

            if ($maxDiscount !== null && $maxDiscount > 0) {
                $discount = min($discount, $maxDiscount);
            }
        } else {
            $discount = $value;
        }

        return round(min(max(0, $discount), $subtotal), 2);
    }

    /**
     * Record successful coupon usage after an order has been created.
     *
     * Must be called inside the same database transaction as bill finalization.
     */
    public function recordUsage(
        Coupon $coupon,
        string $orderId,
        ?string $customerId,
        string $billId,
        float $appliedDiscount
    ): CouponUsage {
        /*
         * IMPORTANT:
         * This method intentionally does NOT open its own transaction.
         *
         * BillingService::finalizeBill() owns the transaction so that:
         * - bill finalization
         * - order synchronization
         * - coupon usage
         * - usage counters
         *
         * either all commit together or all roll back together.
         */

        // CouponUsage.billId is UNIQUE, making usage recording idempotent.
        $existingUsage = CouponUsage::where('billId', $billId)->first();

        if ($existingUsage) {
            return $existingUsage;
        }

        // Serialize all usage consumption for this coupon.
        $lockedCoupon = Coupon::where('id', $coupon->id)
            ->lockForUpdate()
            ->first();

        if (!$lockedCoupon) {
            throw new \Exception('Coupon no longer exists.', 400);
        }

        if (!$lockedCoupon->isActive) {
            throw new \Exception('Coupon is no longer active.', 400);
        }

        $now = now();

        if ($lockedCoupon->startDate && $now->lt($lockedCoupon->startDate)) {
            throw new \Exception('Coupon is not active yet.', 400);
        }

        if ($lockedCoupon->endDate && $now->gt($lockedCoupon->endDate)) {
            throw new \Exception('Coupon has expired.', 400);
        }

        // Re-check the global limit while holding the coupon row lock.
        $usageLimit = (int) ($lockedCoupon->usageLimit ?? 0);

        if (
            $usageLimit > 0 &&
            (int) $lockedCoupon->usedCount >= $usageLimit
        ) {
            throw new \Exception(
                'Coupon usage limit has been reached.',
                400
            );
        }

        if ($customerId) {
            $perCustomerLimit = (int) (
                $lockedCoupon->perCustLimit ?? 0
            );

            if ($perCustomerLimit > 0) {
                /*
                 * Because the coupon row is locked first, competing
                 * usages of this coupon cannot simultaneously create
                 * the same customer counter row.
                 */
                $counter = CustomerCouponUsageCounter::where(
                    'couponId',
                    $lockedCoupon->id
                )
                    ->where('customerId', $customerId)
                    ->lockForUpdate()
                    ->first();

                $currentCount = $counter
                    ? (int) $counter->usageCount
                    : 0;

                if ($currentCount >= $perCustomerLimit) {
                    throw new \Exception(
                        'You have reached the usage limit for this coupon.',
                        400
                    );
                }

                if ($counter) {
                    $counter->usageCount = $currentCount + 1;
                    $counter->version = (int) $counter->version + 1;
                    $counter->save();
                } else {
                    CustomerCouponUsageCounter::create([
                        'couponId' => $lockedCoupon->id,
                        'customerId' => $customerId,
                        'usageCount' => 1,
                        'version' => 1,
                        'createdAt' => now(),
                        'updatedAt' => now(),
                    ]);
                }
            }
        }

        $lockedCoupon->usedCount =
            (int) $lockedCoupon->usedCount + 1;

        $lockedCoupon->save();

        return CouponUsage::create([
            'id' => (string) Str::uuid(),
            'couponId' => $lockedCoupon->id,
            'orderId' => $orderId,
            'customerId' => $customerId,
            'billId' => $billId,
            'couponCodeSnapshot' => $lockedCoupon->code,
            'discountTypeSnapshot' => $lockedCoupon->type,
            'discountValueSnapshot' => (float) $lockedCoupon->value,
            'maximumDiscountSnapshot' =>
                $lockedCoupon->maxDiscount !== null
                    ? (float) $lockedCoupon->maxDiscount
                    : null,
            'appliedDiscountSnapshot' => round(
                $appliedDiscount,
                2
            ),
            'status' => 'ACTIVE',
            'createdAt' => now(),
        ]);
    }

}