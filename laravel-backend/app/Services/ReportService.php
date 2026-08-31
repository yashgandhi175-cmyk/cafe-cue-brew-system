<?php

namespace App\Services;

use App\Models\Bill;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Customer;
use App\Models\Ingredient;
use App\Models\Expense;
use App\Models\RestaurantSettings;
use Illuminate\Support\Carbon;

class ReportService
{
    protected AnalyticsService $analyticsService;
    protected array $eligibleBillStatuses = ['FINALIZED', 'PAID'];

    public function __construct(AnalyticsService $analyticsService)
    {
        $this->analyticsService = $analyticsService;
    }

    public function checkFinancialAccess(string $role): void
    {
        if ($role === 'OWNER') {
            return;
        }
        if ($role === 'MANAGER') {
            $settings = RestaurantSettings::find('default');
            if ($settings && $settings->managerCanViewFinancialReports) {
                return;
            }
            throw new \Exception('Access denied: Manager is not authorized to view financial reports.', 403);
        }
        throw new \Exception('Access denied: Unauthorized role for financial reports.', 403);
    }

    public function getDailySalesReport(string $range = 'TODAY', ?string $startDate = null, ?string $endDate = null, int $page = 1, int $limit = 20): array
    {
        $dates = $this->analyticsService->getKolkataRange($range, $startDate, $endDate);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $bills = Bill::whereBetween('finalizedAt', [$start, $end])
            ->whereIn('status', $this->eligibleBillStatuses)
            ->with('payments')
            ->get();

        $dailyMap = [];

        foreach ($bills as $b) {
            if (!$b->finalizedAt) continue;
            $dayKey = Carbon::parse($b->finalizedAt)->setTimezone('Asia/Kolkata')->format('Y-m-d');

            if (!isset($dailyMap[$dayKey])) {
                $dailyMap[$dayKey] = [
                    'date' => $dayKey,
                    'orders' => 0,
                    'billedSales' => 0.0,
                    'settledCollection' => 0.0,
                    'cash' => 0.0,
                    'upi' => 0.0,
                    'card' => 0.0,
                    'credit' => 0.0,
                    'outstanding' => 0.0,
                    'discounts' => 0.0,
                    'gst' => 0.0,
                    'serviceCharge' => 0.0,
                    'nightCharge' => 0.0,
                ];
            }

            $dailyMap[$dayKey]['orders']++;
            $dailyMap[$dayKey]['billedSales'] += (float)$b->grandTotal;
            $dailyMap[$dayKey]['discounts'] += (float)$b->discount;
            $dailyMap[$dayKey]['gst'] += (float)$b->cgst + (float)$b->sgst;
            $dailyMap[$dayKey]['serviceCharge'] += (float)$b->serviceCharge;
            $dailyMap[$dayKey]['nightCharge'] += (float)$b->nightCharge;

            foreach ($b->payments as $p) {
                if ($p->isSettled) {
                    $dailyMap[$dayKey]['settledCollection'] += (float)$p->amount;
                    if ($p->method === 'CASH') $dailyMap[$dayKey]['cash'] += (float)$p->amount;
                    elseif ($p->method === 'UPI') $dailyMap[$dayKey]['upi'] += (float)$p->amount;
                    elseif ($p->method === 'CARD') $dailyMap[$dayKey]['card'] += (float)$p->amount;
                } else if ($p->method === 'CREDIT') {
                    $dailyMap[$dayKey]['credit'] += (float)$p->amount;
                }
            }
        }

        $allRows = collect($dailyMap)->map(function ($row) {
            $row['billedSales'] = round($row['billedSales'], 2);
            $row['settledCollection'] = round($row['settledCollection'], 2);
            $row['cash'] = round($row['cash'], 2);
            $row['upi'] = round($row['upi'], 2);
            $row['card'] = round($row['card'], 2);
            $row['credit'] = round($row['credit'], 2);
            $row['outstanding'] = max(0.0, round($row['billedSales'] - $row['settledCollection'], 2));
            $row['discounts'] = round($row['discounts'], 2);
            $row['gst'] = round($row['gst'], 2);
            $row['serviceCharge'] = round($row['serviceCharge'], 2);
            $row['nightCharge'] = round($row['nightCharge'], 2);
            return $row;
        })->sortByDesc('date')->values();

        $total = $allRows->count();
        $items = $allRows->forPage($page, $limit)->values()->toArray();

        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'items' => $items,
        ];
    }

    public function getPaymentsReport(string $range = 'TODAY', ?string $startDate = null, ?string $endDate = null, int $page = 1, int $limit = 20): array
    {
        $dates = $this->analyticsService->getKolkataRange($range, $startDate, $endDate);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $query = Payment::whereBetween('paidAt', [$start, $end])
            ->with(['order.table', 'order.customer', 'bill', 'receivedBy']);

        $total = $query->count();
        $payments = $query->orderBy('paidAt', 'desc')
            ->skip(($page - 1) * $limit)
            ->take($limit)
            ->get();

        $items = $payments->map(function ($p) {
            return [
                'id' => $p->id,
                'paidAt' => $p->paidAt ? Carbon::parse($p->paidAt)->setTimezone('Asia/Kolkata')->toDateTimeString() : null,
                'orderNumber' => $p->order?->orderNumber ?? 'N/A',
                'billNumber' => $p->bill?->billNumber ?? 'N/A',
                'customerName' => $p->order?->customer?->name ?? 'Guest',
                'method' => $p->method,
                'amount' => (float)$p->amount,
                'amountTendered' => (float)$p->amountTendered,
                'changeDue' => (float)$p->changeDue,
                'isSettled' => (bool)$p->isSettled,
                'receivedBy' => $p->receivedBy?->name ?? 'Staff',
            ];
        })->toArray();

        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'items' => $items,
        ];
    }

    public function getGSTReport(string $range = 'TODAY', ?string $startDate = null, ?string $endDate = null, int $page = 1, int $limit = 20): array
    {
        $dates = $this->analyticsService->getKolkataRange($range, $startDate, $endDate);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $query = Bill::whereBetween('finalizedAt', [$start, $end])
            ->whereIn('status', $this->eligibleBillStatuses)
            ->with(['order.customer']);

        $total = $query->count();
        $bills = $query->orderBy('finalizedAt', 'desc')
            ->skip(($page - 1) * $limit)
            ->take($limit)
            ->get();

        $items = $bills->map(function ($b) {
            $cgst = (float)$b->cgst;
            $sgst = (float)$b->sgst;
            return [
                'billNumber' => $b->billNumber,
                'orderNumber' => $b->order?->orderNumber ?? 'N/A',
                'date' => $b->finalizedAt ? Carbon::parse($b->finalizedAt)->setTimezone('Asia/Kolkata')->toDateTimeString() : null,
                'customerName' => $b->order?->customer?->name ?? 'Guest',
                'taxableAmount' => (float)$b->taxableAmount,
                'cgst' => $cgst,
                'sgst' => $sgst,
                'totalTax' => round($cgst + $sgst, 2),
                'grandTotal' => (float)$b->grandTotal,
            ];
        })->toArray();

        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'items' => $items,
        ];
    }

    public function getCreditDueReport(string $range = 'TODAY', ?string $startDate = null, ?string $endDate = null, string $filter = 'ALL', int $page = 1, int $limit = 20): array
    {
        $dates = $this->analyticsService->getKolkataRange($range, $startDate, $endDate);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $bills = Bill::whereBetween('finalizedAt', [$start, $end])
            ->whereIn('status', $this->eligibleBillStatuses)
            ->whereHas('payments', function ($q) {
                $q->where('method', 'CREDIT')->where('isSettled', false);
            })
            ->with(['order.customer', 'payments'])
            ->get();

        $rows = [];
        $now = Carbon::now();

        foreach ($bills as $b) {
            $settledSum = $b->payments->where('isSettled', true)->sum('amount');
            $outstanding = max(0.0, (float)$b->grandTotal - $settledSum);
            if ($outstanding <= 0) continue;

            $created = Carbon::parse($b->finalizedAt ?? $b->createdAt);
            $ageDays = $now->diffInDays($created);

            if ($filter === 'DUE_TODAY' && $ageDays > 0) continue;
            if ($filter === 'DUE_1_7' && ($ageDays < 1 || $ageDays > 7)) continue;
            if ($filter === 'DUE_8_30' && ($ageDays < 8 || $ageDays > 30)) continue;
            if ($filter === 'DUE_30_PLUS' && $ageDays <= 30) continue;

            $rows[] = [
                'billNumber' => $b->billNumber,
                'orderNumber' => $b->order?->orderNumber ?? 'N/A',
                'customerName' => $b->order?->customer?->name ?? 'Guest',
                'customerPhone' => $b->order?->customer?->phone ?? 'N/A',
                'date' => $created->setTimezone('Asia/Kolkata')->toDateTimeString(),
                'grandTotal' => (float)$b->grandTotal,
                'settledAmount' => round($settledSum, 2),
                'outstandingAmount' => round($outstanding, 2),
                'ageDays' => $ageDays,
            ];
        }

        $allRows = collect($rows)->sortByDesc('ageDays')->values();
        $total = $allRows->count();
        $items = $allRows->forPage($page, $limit)->values()->toArray();

        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'items' => $items,
        ];
    }

    public function getCancellationsReport(string $range = 'TODAY', ?string $startDate = null, ?string $endDate = null, int $page = 1, int $limit = 20): array
    {
        $dates = $this->analyticsService->getKolkataRange($range, $startDate, $endDate);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $query = Order::whereBetween('createdAt', [$start, $end])
            ->whereIn('status', ['CANCELLED', 'VOIDED'])
            ->with(['customer', 'statusHistory.changedBy']);

        $total = $query->count();
        $orders = $query->orderBy('createdAt', 'desc')
            ->skip(($page - 1) * $limit)
            ->take($limit)
            ->get();

        $items = $orders->map(function ($o) {
            $lastHistory = $o->statusHistory->sortByDesc('changedAt')->first();
            return [
                'orderNumber' => $o->orderNumber,
                'status' => $o->status,
                'grandTotal' => (float)$o->grandTotal,
                'customerName' => $o->customer?->name ?? 'Guest',
                'createdAt' => Carbon::parse($o->createdAt)->setTimezone('Asia/Kolkata')->toDateTimeString(),
                'reason' => $lastHistory?->notes ?? $o->notes ?? 'Cancelled/Voided',
                'cancelledBy' => $lastHistory?->changedBy?->name ?? 'Staff',
            ];
        })->toArray();

        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'items' => $items,
            'cancellations' => $items,
        ];
    }

    public function getOrdersReport(string $range = 'TODAY', ?string $startDate = null, ?string $endDate = null, int $page = 1, int $limit = 20): array
    {
        $dates = $this->analyticsService->getKolkataRange($range, $startDate, $endDate);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $query = Order::whereBetween('createdAt', [$start, $end])
            ->with(['customer', 'table']);

        $total = $query->count();
        $orders = $query->orderBy('createdAt', 'desc')
            ->skip(($page - 1) * $limit)
            ->take($limit)
            ->get();

        $items = $orders->map(function ($o) {
            return [
                'orderNumber' => $o->orderNumber,
                'status' => $o->status,
                'paymentStatus' => $o->paymentStatus,
                'source' => $o->source,
                'tableNumber' => $o->tableNumberSnapshot ?? $o->table?->tableNumber ?? 'N/A',
                'customerName' => $o->customer?->name ?? 'Guest',
                'subtotal' => (float)$o->subtotal,
                'discount' => (float)$o->discount,
                'grandTotal' => (float)$o->grandTotal,
                'createdAt' => Carbon::parse($o->createdAt)->setTimezone('Asia/Kolkata')->toDateTimeString(),
            ];
        })->toArray();

        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'items' => $items,
        ];
    }

    public function getItemSalesReport(string $range = 'TODAY', ?string $startDate = null, ?string $endDate = null, int $page = 1, int $limit = 20): array
    {
        $dates = $this->analyticsService->getKolkataRange($range, $startDate, $endDate);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $orderItems = OrderItem::whereHas('order', function ($q) use ($start, $end) {
            $q->whereBetween('createdAt', [$start, $end])
              ->whereNotIn('status', ['CANCELLED', 'VOIDED']);
        })->get();

        $map = [];
        foreach ($orderItems as $item) {
            $name = $item->nameSnapshot ?? 'Unknown Item';
            if (!isset($map[$name])) {
                $map[$name] = ['name' => $name, 'quantity' => 0, 'revenue' => 0.0];
            }
            $map[$name]['quantity'] += (int)$item->quantity;
            $map[$name]['revenue'] += (float)$item->totalPrice;
        }

        $allRows = collect($map)->map(function ($r) {
            $r['revenue'] = round($r['revenue'], 2);
            return $r;
        })->sortByDesc('revenue')->values();

        $total = $allRows->count();
        $items = $allRows->forPage($page, $limit)->values()->toArray();

        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'items' => $items,
        ];
    }

    public function getCustomersReport(string $range = 'TODAY', ?string $startDate = null, ?string $endDate = null, int $page = 1, int $limit = 20): array
    {
        $dates = $this->analyticsService->getKolkataRange($range, $startDate, $endDate);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $orders = Order::whereBetween('createdAt', [$start, $end])
            ->whereNotIn('status', ['CANCELLED', 'VOIDED'])
            ->whereNotNull('customerId')
            ->with('customer')
            ->get();

        $custMap = [];
        foreach ($orders as $o) {
            $cid = $o->customerId;
            if (!isset($custMap[$cid])) {
                $custMap[$cid] = [
                    'id' => $cid,
                    'name' => $o->customer?->name ?? 'Guest',
                    'phone' => $o->customer?->phone ?? 'N/A',
                    'visitCount' => $o->customer?->visitCount ?? 1,
                    'ordersCount' => 0,
                    'totalSpend' => 0.0,
                ];
            }
            $custMap[$cid]['ordersCount']++;
            $custMap[$cid]['totalSpend'] += (float)$o->grandTotal;
        }

        $allRows = collect($custMap)->map(function ($c) {
            $c['totalSpend'] = round($c['totalSpend'], 2);
            return $c;
        })->sortByDesc('totalSpend')->values();

        $total = $allRows->count();
        $items = $allRows->forPage($page, $limit)->values()->toArray();

        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'items' => $items,
        ];
    }

    public function getDiscountsReport(string $range = 'TODAY', ?string $startDate = null, ?string $endDate = null, int $page = 1, int $limit = 20): array
    {
        $dates = $this->analyticsService->getKolkataRange($range, $startDate, $endDate);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $query = Order::whereBetween('createdAt', [$start, $end])
            ->where('discount', '>', 0)
            ->whereNotIn('status', ['CANCELLED', 'VOIDED'])
            ->with('customer');

        $total = $query->count();
        $orders = $query->orderBy('createdAt', 'desc')
            ->skip(($page - 1) * $limit)
            ->take($limit)
            ->get();

        $items = $orders->map(function ($o) {
            return [
                'orderNumber' => $o->orderNumber,
                'customerName' => $o->customer?->name ?? 'Guest',
                'subtotal' => (float)$o->subtotal,
                'discount' => (float)$o->discount,
                'couponDiscount' => (float)$o->couponDiscount,
                'grandTotal' => (float)$o->grandTotal,
                'date' => Carbon::parse($o->createdAt)->setTimezone('Asia/Kolkata')->toDateTimeString(),
            ];
        })->toArray();

        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'items' => $items,
        ];
    }

    public function getCouponsReport(string $range = 'TODAY', ?string $startDate = null, ?string $endDate = null, int $page = 1, int $limit = 20): array
    {
        $dates = $this->analyticsService->getKolkataRange($range, $startDate, $endDate);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        $query = Order::whereBetween('createdAt', [$start, $end])
            ->where('couponDiscount', '>', 0)
            ->whereNotIn('status', ['CANCELLED', 'VOIDED'])
            ->with('customer');

        $total = $query->count();
        $orders = $query->orderBy('createdAt', 'desc')
            ->skip(($page - 1) * $limit)
            ->take($limit)
            ->get();

        $items = $orders->map(function ($o) {
            return [
                'orderNumber' => $o->orderNumber,
                'customerName' => $o->customer?->name ?? 'Guest',
                'discountAmount' => (float)$o->couponDiscount,
                'grandTotal' => (float)$o->grandTotal,
                'date' => Carbon::parse($o->createdAt)->setTimezone('Asia/Kolkata')->toDateTimeString(),
            ];
        })->toArray();

        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'items' => $items,
        ];
    }

    public function getInventoryValuationReport(?string $userId = null): array
    {
        $ingredients = Ingredient::orderBy('name', 'asc')->get();

        $totalValuation = 0.0;
        $items = [];

        foreach ($ingredients as $ing) {
            $stock = (float)$ing->currentStock;
            $avgCost = (float)$ing->averageCost;
            $val = round($stock * $avgCost, 2);
            $totalValuation += $val;

            $items[] = [
                'id' => $ing->id,
                'name' => $ing->name,
                'unit' => $ing->unit,
                'currentStock' => $stock,
                'averageCost' => $avgCost,
                'totalValue' => $val,
            ];
        }

        return [
            'totalValuation' => round($totalValuation, 2),
            'totalIngredients' => count($items),
            'items' => $items,
        ];
    }

    public function getExpensesReport(string $range = 'TODAY', ?string $startDate = null, ?string $endDate = null, int $page = 1, int $limit = 20): array
    {
        $dates = $this->analyticsService->getKolkataRange($range, $startDate, $endDate);
        $start = $dates['startDateUtc'];
        $end = $dates['endDateUtc'];

        if (!class_exists(Expense::class)) {
            return ['total' => 0, 'page' => $page, 'limit' => $limit, 'items' => []];
        }

        try {
            $query = Expense::whereBetween('expenseDate', [$start, $end]);
            $total = $query->count();
            $expenses = $query->orderBy('expenseDate', 'desc')
                ->skip(($page - 1) * $limit)
                ->take($limit)
                ->get();

            $items = $expenses->map(function ($e) {
                return [
                    'id' => $e->id,
                    'title' => $e->title,
                    'category' => $e->category,
                    'amount' => (float)$e->amount,
                    'expenseDate' => $e->expenseDate,
                    'paymentMethod' => $e->paymentMethod,
                    'status' => $e->status,
                ];
            })->toArray();

            return [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'items' => $items,
            ];
        } catch (\Exception $e) {
            return ['total' => 0, 'page' => $page, 'limit' => $limit, 'items' => []];
        }
    }

    public function exportCsv(string $reportType, string $range = 'TODAY', ?string $startDate = null, ?string $endDate = null, string $filter = 'ALL'): array
    {
        $headers = [];
        $rows = [];

        $escape = function ($val) {
            if ($val === null || $val === '') return '""';
            $str = str_replace('"', '""', (string)$val);
            // Formula injection protection
            if (in_array(substr($str, 0, 1), ['=', '+', '-', '@'])) {
                $str = "'" . $str;
            }
            return '"' . $str . '"';
        };

        if ($reportType === 'daily-sales') {
            $data = $this->getDailySalesReport($range, $startDate, $endDate, 1, 5000)['items'];
            $headers = ['Date', 'Orders', 'Billed Sales', 'Settled Collection', 'Cash', 'UPI', 'Card', 'Credit Due', 'Outstanding', 'Discounts', 'GST', 'Service Charge', 'Night Charge'];
            foreach ($data as $d) {
                $rows[] = [$d['date'], $d['orders'], $d['billedSales'], $d['settledCollection'], $d['cash'], $d['upi'], $d['card'], $d['credit'], $d['outstanding'], $d['discounts'], $d['gst'], $d['serviceCharge'], $d['nightCharge']];
            }
        } elseif ($reportType === 'gst') {
            $data = $this->getGSTReport($range, $startDate, $endDate, 1, 5000)['items'];
            $headers = ['Bill Number', 'Order Number', 'Date', 'Customer Name', 'Taxable Amount', 'CGST', 'SGST', 'Total Tax', 'Grand Total'];
            foreach ($data as $d) {
                $rows[] = [$d['billNumber'], $d['orderNumber'], $d['date'], $d['customerName'], $d['taxableAmount'], $d['cgst'], $d['sgst'], $d['totalTax'], $d['grandTotal']];
            }
        } elseif ($reportType === 'payments') {
            $data = $this->getPaymentsReport($range, $startDate, $endDate, 1, 5000)['items'];
            $headers = ['Paid At', 'Order Number', 'Bill Number', 'Customer Name', 'Method', 'Amount', 'Amount Tendered', 'Change Due', 'Settled', 'Received By'];
            foreach ($data as $d) {
                $rows[] = [$d['paidAt'], $d['orderNumber'], $d['billNumber'], $d['customerName'], $d['method'], $d['amount'], $d['amountTendered'], $d['changeDue'], $d['isSettled'] ? 'YES' : 'NO', $d['receivedBy']];
            }
        } elseif ($reportType === 'credit') {
            $data = $this->getCreditDueReport($range, $startDate, $endDate, $filter, 1, 5000)['items'];
            $headers = ['Bill Number', 'Order Number', 'Customer Name', 'Phone', 'Date', 'Grand Total', 'Settled Amount', 'Outstanding Amount', 'Age (Days)'];
            foreach ($data as $d) {
                $rows[] = [$d['billNumber'], $d['orderNumber'], $d['customerName'], $d['customerPhone'], $d['date'], $d['grandTotal'], $d['settledAmount'], $d['outstandingAmount'], $d['ageDays']];
            }
        } elseif ($reportType === 'cancellations') {
            $data = $this->getCancellationsReport($range, $startDate, $endDate, 1, 5000)['items'];
            $headers = ['Order Number', 'Status', 'Grand Total', 'Customer Name', 'Created At', 'Reason', 'Cancelled By'];
            foreach ($data as $d) {
                $rows[] = [$d['orderNumber'], $d['status'], $d['grandTotal'], $d['customerName'], $d['createdAt'], $d['reason'], $d['cancelledBy']];
            }
        } elseif ($reportType === 'orders') {
            $data = $this->getOrdersReport($range, $startDate, $endDate, 1, 5000)['items'];
            $headers = ['Order Number', 'Status', 'Payment Status', 'Source', 'Table', 'Customer Name', 'Subtotal', 'Discount', 'Grand Total', 'Created At'];
            foreach ($data as $d) {
                $rows[] = [$d['orderNumber'], $d['status'], $d['paymentStatus'], $d['source'], $d['tableNumber'], $d['customerName'], $d['subtotal'], $d['discount'], $d['grandTotal'], $d['createdAt']];
            }
        } elseif ($reportType === 'items') {
            $data = $this->getItemSalesReport($range, $startDate, $endDate, 1, 5000)['items'];
            $headers = ['Item Name', 'Quantity Sold', 'Revenue'];
            foreach ($data as $d) {
                $rows[] = [$d['name'], $d['quantity'], $d['revenue']];
            }
        } elseif ($reportType === 'customers') {
            $data = $this->getCustomersReport($range, $startDate, $endDate, 1, 5000)['items'];
            $headers = ['Customer Name', 'Phone', 'Visit Count', 'Orders Count', 'Total Spend'];
            foreach ($data as $d) {
                $rows[] = [$d['name'], $d['phone'], $d['visitCount'], $d['ordersCount'], $d['totalSpend']];
            }
        } elseif ($reportType === 'discounts') {
            $data = $this->getDiscountsReport($range, $startDate, $endDate, 1, 5000)['items'];
            $headers = ['Order Number', 'Customer Name', 'Subtotal', 'Total Discount', 'Coupon Discount', 'Grand Total', 'Date'];
            foreach ($data as $d) {
                $rows[] = [$d['orderNumber'], $d['customerName'], $d['subtotal'], $d['discount'], $d['couponDiscount'], $d['grandTotal'], $d['date']];
            }
        } elseif ($reportType === 'coupons') {
            $data = $this->getCouponsReport($range, $startDate, $endDate, 1, 5000)['items'];
            $headers = ['Order Number', 'Customer Name', 'Discount Amount', 'Grand Total', 'Date'];
            foreach ($data as $d) {
                $rows[] = [$d['orderNumber'], $d['customerName'], $d['discountAmount'], $d['grandTotal'], $d['date']];
            }
        } else {
            throw new \Exception("Unsupported export report type: {$reportType}", 400);
        }

        $csvLines = [];
        $csvLines[] = implode(',', array_map($escape, $headers));
        foreach ($rows as $r) {
            $csvLines[] = implode(',', array_map($escape, $r));
        }

        return [
            'filename' => "report-{$reportType}-{$range}.csv",
            'content' => implode("\r\n", $csvLines),
        ];
    }
}
