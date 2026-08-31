<?php

namespace App\Services;

use App\Models\Bill;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Customer;
use App\Models\Coupon;
use App\Models\RestaurantTable;
use App\Models\RestaurantSettings;
use App\Models\WaiterCall;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AnalyticsService
{
    protected array $eligibleBillStatuses = ['FINALIZED', 'PAID'];

    public function getKolkataRange(string $rangeType = 'TODAY', ?string $customStart = null, ?string $customEnd = null): array
    {
        $tz = 'Asia/Kolkata';
        $now = Carbon::now($tz);
        $start = Carbon::now($tz)->startOfDay();
        $end = Carbon::now($tz)->endOfDay();

        switch (strtoupper($rangeType)) {
            case 'TODAY':
                $start = $now->copy()->startOfDay();
                $end = $now->copy()->endOfDay();
                break;
            case 'YESTERDAY':
                $start = $now->copy()->subDay()->startOfDay();
                $end = $now->copy()->subDay()->endOfDay();
                break;
            case 'LAST_7_DAYS':
                $start = $now->copy()->subDays(6)->startOfDay();
                $end = $now->copy()->endOfDay();
                break;
            case 'LAST_30_DAYS':
                $start = $now->copy()->subDays(29)->startOfDay();
                $end = $now->copy()->endOfDay();
                break;
            case 'THIS_MONTH':
                $start = $now->copy()->startOfMonth()->startOfDay();
                $end = $now->copy()->endOfMonth()->endOfDay();
                break;
            case 'LAST_MONTH':
                $start = $now->copy()->subMonth()->startOfMonth()->startOfDay();
                $end = $now->copy()->subMonth()->endOfMonth()->endOfDay();
                break;
            case 'CUSTOM':
                if (!$customStart || !$customEnd) {
                    throw new \Exception('Start date and End date are required for CUSTOM range.', 400);
                }
                try {
                    $start = Carbon::parse($customStart, $tz)->startOfDay();
                    $end = Carbon::parse($customEnd, $tz)->endOfDay();
                } catch (\Exception $e) {
                    throw new \Exception('Invalid date format for custom range.', 400);
                }
                if ($start->gt($end)) {
                    throw new \Exception('Start date cannot be after end date.', 400);
                }
                break;
            default:
                $start = $now->copy()->startOfDay();
                $end = $now->copy()->endOfDay();
                break;
        }

        // Return UTC Carbon instances for database queries
        return [
            'startDateUtc' => $start->utc(),
            'endDateUtc' => $end->utc(),
            'tz' => $tz,
        ];
    }

    public function checkFinancialAccess(string $role): void
    {
        if ($role === 'OWNER') {
            return;
        }
        if ($role === 'MANAGER') {
            $settings = RestaurantSettings::find('default');
            if ($settings && $settings->managerCanViewFinancialAnalytics) {
                return;
            }
            throw new \Exception('Access denied: Manager is not authorized to view financial analytics.', 403);
        }
        throw new \Exception('Access denied: Unauthorized role for financial analytics.', 403);
    }

    public function getOverview(string $range = 'TODAY', ?string $customStart = null, ?string $customEnd = null): array
    {
        $dates = $this->getKolkataRange($range, $customStart, $customEnd);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $bills = Bill::whereBetween('finalizedAt', [$start, $end])
            ->whereIn('status', $this->eligibleBillStatuses)
            ->get();

        $billedSales = round((float)$bills->sum('grandTotal'), 2);
        $finalizedCount = $bills->count();
        $averageOrderValue = $finalizedCount > 0 ? round($billedSales / $finalizedCount, 2) : 0.0;

        $payments = Payment::whereBetween('paidAt', [$start, $end])
            ->where('isSettled', true)
            ->get();

        $settledCollection = round((float)$payments->sum('amount'), 2);
        $cashCollection = round((float)$payments->where('method', 'CASH')->sum('amount'), 2);
        $upiCollection = round((float)$payments->where('method', 'UPI')->sum('amount'), 2);
        $cardCollection = round((float)$payments->where('method', 'CARD')->sum('amount'), 2);

        $orderCount = Order::whereBetween('createdAt', [$start, $end])
            ->where('status', '!=', 'VOIDED')
            ->count();

        $outstanding = max(0.0, round($billedSales - $settledCollection, 2));

        // Credit Due
        $creditBills = Bill::whereBetween('finalizedAt', [$start, $end])
            ->whereIn('status', $this->eligibleBillStatuses)
            ->whereHas('payments', function ($q) {
                $q->where('method', 'CREDIT')->where('isSettled', false);
            })
            ->with('payments')
            ->get();

        $creditDue = 0.0;
        foreach ($creditBills as $b) {
            $settled = $b->payments->where('isSettled', true)->sum('amount');
            $creditDue += max(0.0, (float)$b->grandTotal - $settled);
        }
        $creditDue = round($creditDue, 2);

        $cgst = round((float)$bills->sum('cgst'), 2);
        $sgst = round((float)$bills->sum('sgst'), 2);
        $gstCollected = round($cgst + $sgst, 2);
        $discountsGiven = round((float)$bills->sum('discount'), 2);
        $serviceCharge = round((float)$bills->sum('serviceCharge'), 2);
        $nightCharge = round((float)$bills->sum('nightCharge'), 2);

        return [
            'billedSales' => $billedSales,
            'settledCollection' => $settledCollection,
            'orderCount' => $orderCount,
            'averageOrderValue' => $averageOrderValue,
            'outstanding' => $outstanding,
            'creditDue' => $creditDue,
            'cashCollection' => $cashCollection,
            'upiCollection' => $upiCollection,
            'cardCollection' => $cardCollection,
            'gstCollected' => $gstCollected,
            'cgst' => $cgst,
            'sgst' => $sgst,
            'discountsGiven' => $discountsGiven,
            'serviceCharge' => $serviceCharge,
            'nightCharge' => $nightCharge,
        ];
    }

    public function getSalesTrend(string $range = 'TODAY', string $groupBy = 'DAILY', ?string $customStart = null, ?string $customEnd = null): array
    {
        $dates = $this->getKolkataRange($range, $customStart, $customEnd);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $bills = Bill::whereBetween('finalizedAt', [$start, $end])
            ->whereIn('status', $this->eligibleBillStatuses)
            ->select('finalizedAt', 'grandTotal')
            ->get();

        $payments = Payment::whereBetween('paidAt', [$start, $end])
            ->where('isSettled', true)
            ->select('paidAt', 'amount')
            ->get();

        $groups = [];

        $getKey = function ($dateStr) use ($groupBy) {
            $c = Carbon::parse($dateStr)->setTimezone('Asia/Kolkata');
            if ($groupBy === 'HOURLY') {
                return $c->format('g A');
            } elseif ($groupBy === 'MONTHLY') {
                return $c->format('M Y');
            }
            return $c->format('Y-m-d');
        };

        foreach ($bills as $b) {
            if (!$b->finalizedAt) continue;
            $key = $getKey($b->finalizedAt);
            if (!isset($groups[$key])) $groups[$key] = ['billed' => 0.0, 'settled' => 0.0];
            $groups[$key]['billed'] += (float)$b->grandTotal;
        }

        foreach ($payments as $p) {
            if (!$p->paidAt) continue;
            $key = $getKey($p->paidAt);
            if (!isset($groups[$key])) $groups[$key] = ['billed' => 0.0, 'settled' => 0.0];
            $groups[$key]['settled'] += (float)$p->amount;
        }

        $trend = [];
        foreach ($groups as $label => $val) {
            $trend[] = [
                'label' => $label,
                'billedSales' => round($val['billed'], 2),
                'settledCollection' => round($val['settled'], 2),
            ];
        }

        return $trend;
    }

    public function getOrderAnalytics(string $range = 'TODAY', ?string $customStart = null, ?string $customEnd = null): array
    {
        $dates = $this->getKolkataRange($range, $customStart, $customEnd);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $orders = Order::whereBetween('createdAt', [$start, $end])->get();

        $total = $orders->count();
        $qrCount = $orders->where('source', 'QR')->count();
        $posCount = $orders->where('source', '!=', 'QR')->count();
        $dineInCount = $orders->whereNotNull('tableId')->count();
        $takeawayCount = $orders->whereNull('tableId')->count();

        $statuses = [
            'RECEIVED' => $orders->where('status', 'RECEIVED')->count(),
            'ACCEPTED' => $orders->where('status', 'ACCEPTED')->count(),
            'PREPARING' => $orders->where('status', 'PREPARING')->count(),
            'READY' => $orders->where('status', 'READY')->count(),
            'SERVED' => $orders->where('status', 'SERVED')->count(),
            'COMPLETED' => $orders->where('status', 'COMPLETED')->count(),
            'CANCELLED' => $orders->where('status', 'CANCELLED')->count(),
            'VOIDED' => $orders->where('status', 'VOIDED')->count(),
        ];

        $eligibleForCancel = $orders->where('status', '!=', 'VOIDED')->count();
        $cancellationRate = $eligibleForCancel > 0 ? round(($statuses['CANCELLED'] / $eligibleForCancel) * 100, 2) : 0.0;
        $voidRate = $total > 0 ? round(($statuses['VOIDED'] / $total) * 100, 2) : 0.0;

        return [
            'total' => $total,
            'qrCount' => $qrCount,
            'posCount' => $posCount,
            'dineInCount' => $dineInCount,
            'takeawayCount' => $takeawayCount,
            'statuses' => $statuses,
            'cancellationRate' => $cancellationRate,
            'voidRate' => $voidRate,
        ];
    }

    public function getPaymentAnalytics(string $range = 'TODAY', ?string $customStart = null, ?string $customEnd = null): array
    {
        $dates = $this->getKolkataRange($range, $customStart, $customEnd);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $payments = Payment::whereBetween('paidAt', [$start, $end])->get();
        $settled = $payments->where('isSettled', true);

        $totalSettled = round((float)$settled->sum('amount'), 2);
        $cash = round((float)$settled->where('method', 'CASH')->sum('amount'), 2);
        $upi = round((float)$settled->where('method', 'UPI')->sum('amount'), 2);
        $card = round((float)$settled->where('method', 'CARD')->sum('amount'), 2);

        $bills = Bill::whereBetween('finalizedAt', [$start, $end])
            ->whereIn('status', $this->eligibleBillStatuses)
            ->with('payments')
            ->get();

        $creditDue = 0.0;
        foreach ($bills as $b) {
            $hasCredit = $b->payments->where('method', 'CREDIT')->where('isSettled', false)->isNotEmpty();
            if ($hasCredit) {
                $settledSum = $b->payments->where('isSettled', true)->sum('amount');
                $creditDue += max(0.0, (float)$b->grandTotal - $settledSum);
            }
        }
        $creditDue = round($creditDue, 2);

        $billedSales = round((float)$bills->sum('grandTotal'), 2);
        $outstanding = max(0.0, round($billedSales - $totalSettled, 2));

        return [
            'totalSettled' => $totalSettled,
            'cash' => $cash,
            'upi' => $upi,
            'card' => $card,
            'creditDue' => $creditDue,
            'outstanding' => $outstanding,
            'paidBillsCount' => $bills->where('paymentStatus', 'PAID')->count(),
            'partialBillsCount' => $bills->where('paymentStatus', 'PARTIALLY_PAID')->count(),
            'unpaidBillsCount' => $bills->where('paymentStatus', 'UNPAID')->count(),
        ];
    }

    public function getDiscountAnalytics(string $range = 'TODAY', ?string $customStart = null, ?string $customEnd = null): array
    {
        $dates = $this->getKolkataRange($range, $customStart, $customEnd);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $bills = Bill::whereBetween('finalizedAt', [$start, $end])
            ->whereIn('status', $this->eligibleBillStatuses)
            ->get();

        $total = round((float)$bills->sum('discount'), 2);
        $itemDiscounts = round((float)$bills->sum('itemDiscount'), 2);
        $couponDiscounts = round((float)$bills->sum('couponDiscount'), 2);
        $manualDiscounts = round((float)$bills->sum('manualDiscount'), 2);

        $manualBills = $bills->where('manualDiscount', '>', 0);
        $manualDiscountCount = $manualBills->count();
        $averageManualDiscount = $manualDiscountCount > 0 ? round($manualDiscounts / $manualDiscountCount, 2) : 0.0;

        $orders = Order::whereBetween('createdAt', [$start, $end])
            ->where('couponDiscount', '>', 0)
            ->get();

        $couponUsageCount = $orders->count();
        $couponDiscountAmount = round((float)$orders->sum('couponDiscount'), 2);

        return [
            'total' => $total,
            'itemDiscounts' => $itemDiscounts,
            'couponDiscounts' => $couponDiscounts,
            'manualDiscounts' => $manualDiscounts,
            'manualDiscountCount' => $manualDiscountCount,
            'averageManualDiscount' => $averageManualDiscount,
            'couponUsageCount' => $couponUsageCount,
            'couponDiscountAmount' => $couponDiscountAmount,
            'topCoupons' => [],
        ];
    }

    public function getItemAnalytics(string $range = 'TODAY', ?string $customStart = null, ?string $customEnd = null): array
    {
        $dates = $this->getKolkataRange($range, $customStart, $customEnd);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $orderItems = OrderItem::whereHas('order', function ($q) use ($start, $end) {
            $q->whereBetween('createdAt', [$start, $end])
              ->whereNotIn('status', ['CANCELLED', 'VOIDED']);
        })->get();

        $itemMap = [];
        $totalRev = 0.0;

        foreach ($orderItems as $item) {
            $name = $item->nameSnapshot ?? 'Unknown Item';
            $qty = (int)$item->quantity;
            $rev = (float)$item->totalPrice;
            $totalRev += $rev;

            if (!isset($itemMap[$name])) {
                $itemMap[$name] = ['name' => $name, 'quantity' => 0, 'revenue' => 0.0];
            }
            $itemMap[$name]['quantity'] += $qty;
            $itemMap[$name]['revenue'] += $rev;
        }

        $topItems = collect($itemMap)->map(function ($it) use ($totalRev) {
            $it['revenue'] = round($it['revenue'], 2);
            $it['percentage'] = $totalRev > 0 ? round(($it['revenue'] / $totalRev) * 100, 2) : 0.0;
            return $it;
        })->sortByDesc('revenue')->values()->take(10)->toArray();

        return [
            'totalRevenue' => round($totalRev, 2),
            'totalItemsSold' => (int)$orderItems->sum('quantity'),
            'topItems' => $topItems,
        ];
    }

    public function getCustomerAnalytics(string $range = 'TODAY', ?string $customStart = null, ?string $customEnd = null): array
    {
        $dates = $this->getKolkataRange($range, $customStart, $customEnd);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $orders = Order::whereBetween('createdAt', [$start, $end])
            ->whereNotIn('status', ['CANCELLED', 'VOIDED'])
            ->whereNotNull('customerId')
            ->with('customer')
            ->get();

        $uniqueCustIds = $orders->pluck('customerId')->unique();
        $totalCustomers = $uniqueCustIds->count();

        $newCustomers = 0;
        $repeatCustomers = 0;

        foreach ($uniqueCustIds as $cid) {
            $cust = $orders->firstWhere('customerId', $cid)?->customer;
            if ($cust && $cust->visitCount <= 1) {
                $newCustomers++;
            } else {
                $repeatCustomers++;
            }
        }

        $totalSales = round((float)$orders->sum('grandTotal'), 2);

        return [
            'totalCustomers' => $totalCustomers,
            'newCustomers' => $newCustomers,
            'repeatCustomers' => $repeatCustomers,
            'totalSales' => $totalSales,
            'averageSpendPerCustomer' => $totalCustomers > 0 ? round($totalSales / $totalCustomers, 2) : 0.0,
        ];
    }

    public function getOrderPerformance(string $range = 'TODAY', ?string $customStart = null, ?string $customEnd = null): array
    {
        $dates = $this->getKolkataRange($range, $customStart, $customEnd);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $orders = Order::whereBetween('createdAt', [$start, $end])
            ->where('status', 'COMPLETED')
            ->with('statusHistory')
            ->get();

        $prepTimes = [];
        $turnaroundTimes = [];

        foreach ($orders as $order) {
            $history = $order->statusHistory->sortBy('changedAt');
            $created = Carbon::parse($order->createdAt);
            $accepted = $history->firstWhere('newStatus', 'ACCEPTED') ? Carbon::parse($history->firstWhere('newStatus', 'ACCEPTED')->changedAt) : null;
            $ready = $history->firstWhere('newStatus', 'READY') ? Carbon::parse($history->firstWhere('newStatus', 'READY')->changedAt) : null;
            $completed = $history->firstWhere('newStatus', 'COMPLETED') ? Carbon::parse($history->firstWhere('newStatus', 'COMPLETED')->changedAt) : null;

            if ($accepted && $ready) {
                $prepTimes[] = max(0, $ready->diffInMinutes($accepted));
            }
            if ($completed) {
                $turnaroundTimes[] = max(0, $completed->diffInMinutes($created));
            }
        }

        $avgPrep = !empty($prepTimes) ? round(array_sum($prepTimes) / count($prepTimes), 1) : 0.0;
        $avgTurnaround = !empty($turnaroundTimes) ? round(array_sum($turnaroundTimes) / count($turnaroundTimes), 1) : 0.0;

        return [
            'completedOrdersCount' => $orders->count(),
            'averagePreparationTimeMinutes' => $avgPrep,
            'averageTurnaroundTimeMinutes' => $avgTurnaround,
        ];
    }

    public function getWaiterCalls(string $range = 'TODAY', ?string $customStart = null, ?string $customEnd = null): array
    {
        $dates = $this->getKolkataRange($range, $customStart, $customEnd);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        if (!class_exists(WaiterCall::class)) {
            return ['total' => 0, 'responded' => 0, 'averageResponseTimeMinutes' => 0.0];
        }

        try {
            $calls = WaiterCall::whereBetween('createdAt', [$start, $end])->get();
            $total = $calls->count();
            $responded = $calls->whereNotNull('respondedAt')->count();

            return [
                'total' => $total,
                'responded' => $responded,
                'averageResponseTimeMinutes' => 0.0,
            ];
        } catch (\Exception $e) {
            return ['total' => 0, 'responded' => 0, 'averageResponseTimeMinutes' => 0.0];
        }
    }

    public function getTableAnalytics(string $range = 'TODAY', ?string $customStart = null, ?string $customEnd = null): array
    {
        $dates = $this->getKolkataRange($range, $customStart, $customEnd);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $orders = Order::whereBetween('createdAt', [$start, $end])
            ->whereNotNull('tableId')
            ->whereNotIn('status', ['CANCELLED', 'VOIDED'])
            ->get();

        $tableMap = [];
        foreach ($orders as $order) {
            $tNum = $order->tableNumberSnapshot ?? 'Table ' . $order->tableId;
            if (!isset($tableMap[$tNum])) {
                $tableMap[$tNum] = ['tableNumber' => $tNum, 'orderCount' => 0, 'totalRevenue' => 0.0];
            }
            $tableMap[$tNum]['orderCount']++;
            $tableMap[$tNum]['totalRevenue'] += (float)$order->grandTotal;
        }

        $tables = collect($tableMap)->map(function ($t) {
            $t['totalRevenue'] = round($t['totalRevenue'], 2);
            return $t;
        })->sortByDesc('totalRevenue')->values()->toArray();

        return [
            'totalDineInOrders' => $orders->count(),
            'tables' => $tables,
        ];
    }

    public function getCouponAnalytics(string $range = 'TODAY', ?string $customStart = null, ?string $customEnd = null): array
    {
        $dates = $this->getKolkataRange($range, $customStart, $customEnd);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $orders = Order::whereBetween('createdAt', [$start, $end])
            ->where('couponDiscount', '>', 0)
            ->whereNotIn('status', ['CANCELLED', 'VOIDED'])
            ->get();

        $totalDiscount = round((float)$orders->sum('couponDiscount'), 2);
        $totalSalesWithCoupon = round((float)$orders->sum('grandTotal'), 2);

        return [
            'redemptionCount' => $orders->count(),
            'totalDiscountAmount' => $totalDiscount,
            'totalSalesWithCoupon' => $totalSalesWithCoupon,
        ];
    }
}
