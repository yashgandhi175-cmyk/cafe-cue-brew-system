<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\LoyaltyTransaction;
use App\Models\LoyaltyRedemptionRequest;
use App\Models\Bill;
use App\Models\Staff;
use App\Models\RestaurantSettings;
use App\Models\AuditLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class LoyaltyService
{
    public function checkPermission(string $staffId, string $capability): void
    {
        $staff = Staff::find($staffId);
        if (!$staff) {
            throw new \Exception('Staff member not found.', 403);
        }
        if ($staff->role === 'OWNER') {
            return;
        }
        if ($capability === 'ownerOnly') {
            throw new \Exception('Only owners can perform this action.', 403);
        }

        $settings = RestaurantSettings::find('default');
        if (!$settings) {
            throw new \Exception('Settings not initialized.', 403);
        }

        if ($capability === 'managerCanAdjustLoyaltyPoints' && $staff->role === 'MANAGER' && !empty($settings->managerCanAdjustLoyaltyPoints)) {
            return;
        }
        if ($capability === 'managerCanApproveLoyaltyRedemption' && $staff->role === 'MANAGER' && !empty($settings->managerCanApproveLoyaltyRedemption)) {
            return;
        }

        throw new \Exception('You do not have permission to manage loyalty.', 403);
    }

    public function getLoyaltyProfile(string $customerId): array
    {
        $customer = Customer::find($customerId);
        if (!$customer) {
            throw new \Exception('Customer not found.', 404);
        }

        $settings = RestaurantSettings::find('default');
        $enableLoyalty = $settings ? (bool)$settings->enableLoyalty : false;
        $spendAmount = $settings ? (float)($settings->loyaltySpendAmount ?? 100.0) : 100.0;
        $pointsEarned = $settings ? (int)($settings->loyaltyPointsEarned ?? 1) : 1;
        $redemptionPoints = $settings ? (int)($settings->loyaltyRedemptionPoints ?? 10) : 10;
        $redemptionValue = $settings ? (float)($settings->loyaltyRedemptionValue ?? 10.0) : 10.0;
        $minRedeemPoints = $settings ? (int)($settings->loyaltyMinimumRedeemPoints ?? 10) : 10;
        $maxRedeemPercent = $settings ? (float)($settings->loyaltyMaximumRedeemPercent ?? 100.0) : 100.0;

        $recentTransactions = LoyaltyTransaction::where('customerId', $customerId)
            ->orderBy('createdAt', 'desc')
            ->take(10)
            ->get()
            ->toArray();

        return [
            'customerId' => $customerId,
            'loyaltyPoints' => (int)$customer->loyaltyPoints,
            'loyaltyEnabled' => $enableLoyalty,
            'earningRule' => [
                'spendAmount' => $spendAmount,
                'pointsEarned' => $pointsEarned,
            ],
            'redemptionRule' => [
                'redemptionPoints' => $redemptionPoints,
                'redemptionValue' => $redemptionValue,
                'minimumRedeemPoints' => $minRedeemPoints,
                'maximumRedeemPercent' => $maxRedeemPercent,
            ],
            'recentTransactions' => $recentTransactions,
        ];
    }

    public function getTransactions(string $customerId, int $page = 1, int $limit = 20): array
    {
        $skip = ($page - 1) * $limit;
        $finalLimit = min($limit, 100);

        $items = LoyaltyTransaction::with('createdBy:id,name')
            ->where('customerId', $customerId)
            ->orderBy('createdAt', 'desc')
            ->skip($skip)
            ->take($finalLimit)
            ->get()
            ->toArray();

        $total = LoyaltyTransaction::where('customerId', $customerId)->count();

        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $finalLimit,
        ];
    }

    public function createRedemptionRequest(array $dto): LoyaltyRedemptionRequest
    {
        return DB::transaction(function () use ($dto) {
            $settings = RestaurantSettings::find('default');
            if (!$settings || !$settings->enableLoyalty) {
                throw new \Exception('Loyalty system is currently disabled.', 400);
            }

            $customer = Customer::find($dto['customerId']);
            if (!$customer) throw new \Exception('Customer not found.', 404);
            if ($customer->status !== 'ACTIVE') {
                throw new \Exception('Loyalty redemption is only allowed for active customers.', 400);
            }

            $bill = Bill::find($dto['billId']);
            if (!$bill) throw new \Exception('Bill not found.', 404);
            if ($bill->status !== 'DRAFT') {
                throw new \Exception('Loyalty redemption requests can only be made for draft bills.', 400);
            }

            $reqPoints = (int)$dto['requestedPoints'];
            if ((int)$customer->loyaltyPoints < $reqPoints) {
                throw new \Exception('Insufficient loyalty points.', 400);
            }

            $minPoints = (int)($settings->loyaltyMinimumRedeemPoints ?? 10);
            if ($reqPoints < $minPoints) {
                throw new \Exception("Minimum points required to redeem is {$minPoints}.", 400);
            }

            $expiryMins = (int)($settings->loyaltyRedemptionRequestExpiryMinutes ?? 15);
            $expiresAt = date('Y-m-d H:i:s', time() + ($expiryMins * 60));

            $request = LoyaltyRedemptionRequest::create([
                'id' => (string)Str::uuid(),
                'billId' => $dto['billId'],
                'customerId' => $dto['customerId'],
                'requestedPoints' => $reqPoints,
                'status' => 'PENDING',
                'expiresAt' => $expiresAt,
            ]);

            $updatedBills = DB::update("
                UPDATE `Bill`
                SET `activeRedemptionRequestId` = ?
                WHERE `id` = ? AND `activeRedemptionRequestId` IS NULL
            ", [$request->id, $dto['billId']]);

            if ($updatedBills === 0) {
                throw new \Exception('This bill already has a pending or active redemption request.', 409);
            }

            return $request;
        });
    }

    public function getRedemptionRequest(string $id): array
    {
        $request = LoyaltyRedemptionRequest::with(['customer', 'bill'])->find($id);
        if (!$request) {
            throw new \Exception('Redemption request not found.', 404);
        }
        return $request->toArray();
    }

    public function checkRequestExpiry(string $requestId): void
    {
        $request = LoyaltyRedemptionRequest::find($requestId);
        if (!$request || $request->status !== 'PENDING') {
            return;
        }

        if ($request->expiresAt && strtotime($request->expiresAt) <= time()) {
            DB::transaction(function () use ($request, $requestId) {
                $updated = DB::update("
                    UPDATE `LoyaltyRedemptionRequest`
                    SET `status` = 'EXPIRED', `expiredAt` = NOW()
                    WHERE `id` = ? AND `status` = 'PENDING'
                ", [$requestId]);

                if ($updated > 0) {
                    DB::update("
                        UPDATE `Bill`
                        SET `activeRedemptionRequestId` = NULL
                        WHERE `id` = ? AND `activeRedemptionRequestId` = ?
                    ", [$request->billId, $requestId]);
                }
            });
        }
    }

    public function approveRedemptionRequest(string $requestId, string $staffId): LoyaltyRedemptionRequest
    {
        $this->checkPermission($staffId, 'managerCanApproveLoyaltyRedemption');
        $this->checkRequestExpiry($requestId);

        return DB::transaction(function () use ($requestId, $staffId) {
            $request = LoyaltyRedemptionRequest::find($requestId);
            if (!$request) throw new \Exception('Redemption request not found.', 404);
            if ($request->status !== 'PENDING') {
                throw new \Exception('Request is no longer pending.', 400);
            }

            $customer = Customer::find($request->customerId);
            if (!$customer) throw new \Exception('Customer not found.', 404);

            if ((int)$customer->loyaltyPoints < (int)$request->requestedPoints) {
                throw new \Exception('Customer no longer has enough points.', 400);
            }

            $updatedRequests = DB::update("
                UPDATE `LoyaltyRedemptionRequest`
                SET `status` = 'APPROVED', `approvedPoints` = ?, `approvedAt` = NOW(), `approvedByStaffId` = ?
                WHERE `id` = ? AND `status` = 'PENDING'
            ", [$request->requestedPoints, $staffId, $requestId]);

            if ($updatedRequests === 0) {
                throw new \Exception('Request was resolved concurrently by another process.', 409);
            }

            DB::update("
                UPDATE `Bill`
                SET `activeRedemptionRequestId` = NULL
                WHERE `id` = ? AND `activeRedemptionRequestId` = ?
            ", [$request->billId, $requestId]);

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staffId,
                'action' => 'LOYALTY_REDEMPTION_APPROVED',
                'entityType' => 'LoyaltyRedemptionRequest',
                'entityId' => $requestId,
                'newData' => json_encode([
                    'requestId' => $requestId,
                    'customerId' => $request->customerId,
                    'points' => $request->requestedPoints,
                ]),
                'ipAddress' => '127.0.0.1',
                'createdAt' => now(),
            ]);

            return LoyaltyRedemptionRequest::find($requestId);
        });
    }

    public function rejectRedemptionRequest(string $requestId, string $staffId): LoyaltyRedemptionRequest
    {
        $this->checkPermission($staffId, 'managerCanApproveLoyaltyRedemption');
        $this->checkRequestExpiry($requestId);

        return DB::transaction(function () use ($requestId, $staffId) {
            $request = LoyaltyRedemptionRequest::find($requestId);
            if (!$request) throw new \Exception('Redemption request not found.', 404);
            if ($request->status !== 'PENDING') {
                throw new \Exception('Request is no longer pending.', 400);
            }

            $updatedRequests = DB::update("
                UPDATE `LoyaltyRedemptionRequest`
                SET `status` = 'REJECTED', `rejectedAt` = NOW(), `rejectedByStaffId` = ?
                WHERE `id` = ? AND `status` = 'PENDING'
            ", [$staffId, $requestId]);

            if ($updatedRequests === 0) {
                throw new \Exception('Request was resolved concurrently by another process.', 409);
            }

            DB::update("
                UPDATE `Bill`
                SET `activeRedemptionRequestId` = NULL
                WHERE `id` = ? AND `activeRedemptionRequestId` = ?
            ", [$request->billId, $requestId]);

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staffId,
                'action' => 'LOYALTY_REDEMPTION_REJECTED',
                'entityType' => 'LoyaltyRedemptionRequest',
                'entityId' => $requestId,
                'newData' => json_encode([
                    'requestId' => $requestId,
                    'customerId' => $request->customerId,
                ]),
                'ipAddress' => '127.0.0.1',
                'createdAt' => now(),
            ]);

            return LoyaltyRedemptionRequest::find($requestId);
        });
    }

    public function cancelRedemptionRequest(string $requestId): LoyaltyRedemptionRequest
    {
        $this->checkRequestExpiry($requestId);

        return DB::transaction(function () use ($requestId) {
            $request = LoyaltyRedemptionRequest::find($requestId);
            if (!$request) throw new \Exception('Redemption request not found.', 404);
            if ($request->status !== 'PENDING') {
                throw new \Exception('Request is no longer pending.', 400);
            }

            $updatedRequests = DB::update("
                UPDATE `LoyaltyRedemptionRequest`
                SET `status` = 'CANCELLED', `cancelledAt` = NOW()
                WHERE `id` = ? AND `status` = 'PENDING'
            ", [$requestId]);

            if ($updatedRequests === 0) {
                throw new \Exception('Request was resolved concurrently by another process.', 409);
            }

            DB::update("
                UPDATE `Bill`
                SET `activeRedemptionRequestId` = NULL
                WHERE `id` = ? AND `activeRedemptionRequestId` = ?
            ", [$request->billId, $requestId]);

            return LoyaltyRedemptionRequest::find($requestId);
        });
    }

    public function adjustPoints(string $customerId, array $dto, string $staffId): LoyaltyTransaction
    {
        $this->checkPermission($staffId, 'managerCanAdjustLoyaltyPoints');

        if (empty($dto['reason']) || trim($dto['reason']) === '') {
            throw new \Exception('Reason is mandatory.', 400);
        }
        if (empty($dto['idempotencyKey']) || trim($dto['idempotencyKey']) === '') {
            throw new \Exception('Idempotency key is required.', 400);
        }

        return DB::transaction(function () use ($customerId, $dto, $staffId) {
            $existing = LoyaltyTransaction::where('idempotencyKey', $dto['idempotencyKey'])->first();
            if ($existing) {
                return $existing;
            }

            $customer = Customer::where('id', $customerId)->lockForUpdate()->first();
            if (!$customer) throw new \Exception('Customer not found.', 404);

            $ptsChange = (int)$dto['pointsChange'];
            $newBalance = (int)$customer->loyaltyPoints + $ptsChange;

            if ($newBalance < 0) {
                throw new \Exception('Adjustment would produce a negative loyalty points balance.', 400);
            }

            $customer->loyaltyPoints = $newBalance;
            $customer->save();

            $txType = $ptsChange > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';

            $transaction = LoyaltyTransaction::create([
                'id' => (string)Str::uuid(),
                'customerId' => $customerId,
                'type' => $txType,
                'pointsChange' => $ptsChange,
                'balanceAfter' => $newBalance,
                'reason' => $dto['reason'],
                'idempotencyKey' => $dto['idempotencyKey'],
                'createdByStaffId' => $staffId,
                'createdAt' => now(),
            ]);

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staffId,
                'action' => 'LOYALTY_MANUAL_ADJUSTMENT',
                'entityType' => 'LoyaltyTransaction',
                'entityId' => $transaction->id,
                'newData' => json_encode([
                    'customerId' => $customerId,
                    'pointsChange' => $ptsChange,
                    'transactionId' => $transaction->id,
                ]),
                'ipAddress' => '127.0.0.1',
                'createdAt' => now(),
            ]);

            return $transaction;
        });
    }

    public function getAnalytics(string $staffId): array
    {
        $this->checkPermission($staffId, 'ownerOnly');

        $totalEarned = (int)LoyaltyTransaction::where('type', 'EARN')->sum('pointsChange');
        $totalRedeemed = abs((int)LoyaltyTransaction::where('type', 'REDEEM')->sum('pointsChange'));
        $totalReversed = (int)LoyaltyTransaction::whereIn('type', ['EARN_REVERSAL', 'REDEMPTION_REVERSAL'])->sum('pointsChange');
        $totalAdjIn = (int)LoyaltyTransaction::where('type', 'ADJUSTMENT_IN')->sum('pointsChange');
        $totalAdjOut = abs((int)LoyaltyTransaction::where('type', 'ADJUSTMENT_OUT')->sum('pointsChange'));

        $outstandingBalance = (int)Customer::sum('loyaltyPoints');
        $customersWithPoints = Customer::where('loyaltyPoints', '>', 0)->count();

        $redemptionCount = LoyaltyTransaction::where('type', 'REDEEM')->count();
        $redemptionValue = (float)LoyaltyTransaction::where('type', 'REDEEM')->sum('redemptionValueSnapshot');

        $topCustomers = Customer::where('loyaltyPoints', '>', 0)
            ->orderBy('loyaltyPoints', 'desc')
            ->take(5)
            ->get(['id', 'name', 'phone', 'loyaltyPoints'])
            ->toArray();

        $sevenDaysAgo = date('Y-m-d H:i:s', strtotime('-7 days'));
        $trendTx = LoyaltyTransaction::where('createdAt', '>=', $sevenDaysAgo)
            ->get(['createdAt', 'type', 'pointsChange']);

        $trendMap = [];
        for ($i = 0; $i < 7; $i++) {
            $dStr = date('Y-m-d', strtotime("-{$i} days"));
            $trendMap[$dStr] = ['earned' => 0, 'redeemed' => 0];
        }

        foreach ($trendTx as $tx) {
            $dStr = date('Y-m-d', strtotime($tx->createdAt));
            if (isset($trendMap[$dStr])) {
                if ($tx->type === 'EARN') {
                    $trendMap[$dStr]['earned'] += (int)$tx->pointsChange;
                } elseif ($tx->type === 'REDEEM') {
                    $trendMap[$dStr]['redeemed'] += abs((int)$tx->pointsChange);
                }
            }
        }

        $trend = [];
        foreach ($trendMap as $dStr => $data) {
            $trend[] = ['date' => $dStr, 'earned' => $data['earned'], 'redeemed' => $data['redeemed']];
        }
        usort($trend, fn($a, $b) => strcmp($a['date'], $b['date']));

        return [
            'pointsEarned' => $totalEarned,
            'pointsRedeemed' => $totalRedeemed,
            'pointsReversed' => $totalReversed,
            'manualAdjustmentIn' => $totalAdjIn,
            'manualAdjustmentOut' => $totalAdjOut,
            'outstandingLoyaltyPoints' => $outstandingBalance,
            'customersWithLoyaltyPoints' => $customersWithPoints,
            'averagePointsPerActiveCustomer' => $customersWithPoints > 0 ? $outstandingBalance / $customersWithPoints : 0,
            'redemptionCount' => $redemptionCount,
            'redemptionValue' => $redemptionValue,
            'topLoyaltyCustomers' => $topCustomers,
            'loyaltyTransactionsTrend' => $trend,
        ];
    }

    public function listRedemptionRequests(array $filter): array
    {
        $query = LoyaltyRedemptionRequest::query();
        if (!empty($filter['billId'])) $query->where('billId', $filter['billId']);
        if (!empty($filter['customerId'])) $query->where('customerId', $filter['customerId']);
        if (!empty($filter['status'])) $query->where('status', $filter['status']);

        return $query->orderBy('createdAt', 'desc')->get()->toArray();
    }
}
