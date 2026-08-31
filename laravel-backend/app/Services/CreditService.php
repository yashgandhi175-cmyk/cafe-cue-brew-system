<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CreditLedger;
use App\Models\CreditPayment;
use App\Models\Bill;
use App\Models\Order;
use App\Models\AuditLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CreditService
{
    public function getCreditsSummary(?string $search): array
    {
        $query = Customer::with(['creditLedgers.payments' => function ($q) {
            $q->orderBy('paidAt', 'desc')->take(1);
        }]);

        if (!empty($search)) {
            $s = trim($search);
            $query->where(function ($q) use ($s) {
                $q->where('name', 'LIKE', "%{$s}%")
                  ->orWhere('phone', 'LIKE', "%{$s}%")
                  ->orWhereHas('creditLedgers', function ($cq) use ($s) {
                      $cq->where('invoiceNumber', 'LIKE', "%{$s}%");
                  });
            });
        }

        $customers = $query->orderBy('name', 'asc')->get();
        $now = time();
        $res = [];

        foreach ($customers as $customer) {
            $ledgers = $customer->creditLedgers;
            if ($ledgers->count() === 0) continue;

            $activeLedgers = $ledgers->filter(fn($l) => $l->settlementStatus !== 'PAID');

            $outstandingAmount = (float)$activeLedgers->sum('outstandingAmount');
            $overdueAmount = 0.0;
            $maxOverdueDays = 0;

            foreach ($activeLedgers as $ledger) {
                if ($ledger->dueDate && strtotime($ledger->dueDate) < $now) {
                    $diffTime = abs($now - strtotime($ledger->dueDate));
                    $diffDays = (int)ceil($diffTime / 86400);
                    $overdueAmount += (float)$ledger->outstandingAmount;
                    if ($diffDays > $maxOverdueDays) {
                        $maxOverdueDays = $diffDays;
                    }
                }
            }

            $lastPaymentDate = null;
            foreach ($ledgers as $l) {
                if ($l->payments->count() > 0) {
                    $pDate = $l->payments[0]->paidAt;
                    if (!$lastPaymentDate || strtotime($pDate) > strtotime($lastPaymentDate)) {
                        $lastPaymentDate = date('Y-m-d H:i:s', strtotime($pDate));
                    }
                }
            }

            $status = ($overdueAmount > 0) ? 'OVERDUE' : (($outstandingAmount > 0) ? 'ACTIVE' : 'CLEARED');

            $res[] = [
                'customerId' => $customer->id,
                'name' => $customer->name,
                'phone' => $customer->phone,
                'outstandingAmount' => $outstandingAmount,
                'overdueAmount' => $overdueAmount,
                'openInvoicesCount' => $activeLedgers->count(),
                'overdueDays' => $maxOverdueDays,
                'lastPaymentDate' => $lastPaymentDate,
                'status' => $status,
            ];
        }

        return $res;
    }

    public function getCustomerCreditDetails(string $customerId): array
    {
        $customer = Customer::with(['creditLedgers' => function ($q) {
            $q->with(['payments.receivedBy:id,name'])
              ->orderBy('dueDate', 'asc')
              ->orderBy('invoiceDate', 'desc');
        }])->find($customerId);

        if (!$customer) {
            throw new \Exception('Customer not found', 404);
        }

        $now = time();
        $timeline = [];
        $totalOutstanding = 0.0;
        $totalPaid = 0.0;
        $overdueAmount = 0.0;
        $oldestDueDate = null;
        $lastPaymentDate = null;
        $totalPeriodDays = 0;
        $paidCount = 0;

        foreach ($customer->creditLedgers as $ledger) {
            $ledgerOutstanding = (float)$ledger->outstandingAmount;
            $ledgerBillAmount = (float)$ledger->billAmount;
            $ledgerPaid = $ledgerBillAmount - $ledgerOutstanding;

            $totalOutstanding += $ledgerOutstanding;
            $totalPaid += $ledgerPaid;

            if ($ledger->settlementStatus !== 'PAID') {
                if ($ledger->dueDate && strtotime($ledger->dueDate) < $now) {
                    $overdueAmount += $ledgerOutstanding;
                }
                if ($ledger->dueDate && (!$oldestDueDate || strtotime($ledger->dueDate) < strtotime($oldestDueDate))) {
                    $oldestDueDate = date('Y-m-d H:i:s', strtotime($ledger->dueDate));
                }
            }

            $timeline[] = [
                'type' => 'INVOICE_CREATED',
                'date' => date('Y-m-d H:i:s', strtotime($ledger->invoiceDate)),
                'description' => "Invoice {$ledger->invoiceNumber} created on Credit",
                'amount' => $ledgerBillAmount,
                'outstanding' => $ledgerOutstanding,
                'meta' => ['ledgerId' => $ledger->id, 'invoiceNumber' => $ledger->invoiceNumber],
            ];

            foreach ($ledger->payments as $payment) {
                $pDate = date('Y-m-d H:i:s', strtotime($payment->paidAt));
                if (!$lastPaymentDate || strtotime($pDate) > strtotime($lastPaymentDate)) {
                    $lastPaymentDate = $pDate;
                }

                $diffTime = abs(strtotime($pDate) - strtotime($ledger->invoiceDate));
                $diffDays = (int)ceil($diffTime / 86400);
                $totalPeriodDays += $diffDays;
                $paidCount++;

                $timeline[] = [
                    'type' => 'PAYMENT_RECEIVED',
                    'date' => $pDate,
                    'description' => "Received payment of ₹{$payment->amount} via {$payment->method} against {$ledger->invoiceNumber}",
                    'amount' => (float)$payment->amount,
                    'receivedBy' => $payment->receivedBy->name ?? 'Staff',
                    'meta' => [
                        'paymentId' => $payment->id,
                        'ledgerId' => $ledger->id,
                        'invoiceNumber' => $ledger->invoiceNumber,
                    ],
                ];
            }
        }

        usort($timeline, fn($a, $b) => strtotime($b['date']) <=> strtotime($a['date']));

        $openInvoicesCount = $customer->creditLedgers->filter(fn($l) => $l->settlementStatus !== 'PAID')->count();
        $avgCollectionDays = $paidCount > 0 ? (int)round($totalPeriodDays / $paidCount) : 0;
        $creditLimit = 50000;
        $availableCredit = max(0, $creditLimit - $totalOutstanding);

        $invoices = [];
        foreach ($customer->creditLedgers as $l) {
            $creditPaymentsSum = (float)$l->payments->sum('amount');
            $isOverdue = $l->dueDate ? ($now > strtotime($l->dueDate) && $l->settlementStatus !== 'PAID') : false;
            $daysOverdue = 0;
            if ($isOverdue && $l->dueDate) {
                $daysOverdue = (int)ceil(abs($now - strtotime($l->dueDate)) / 86400);
            }

            $invoices[] = [
                'id' => $l->id,
                'invoiceNumber' => $l->invoiceNumber,
                'invoiceDate' => date('Y-m-d H:i:s', strtotime($l->invoiceDate)),
                'billAmount' => (float)$l->billAmount,
                'paidAmount' => $creditPaymentsSum,
                'outstandingAmount' => (float)$l->outstandingAmount,
                'dueDate' => $l->dueDate ? date('Y-m-d H:i:s', strtotime($l->dueDate)) : null,
                'creditType' => $l->creditType,
                'settlementStatus' => $isOverdue ? 'OVERDUE' : $l->settlementStatus,
                'notes' => $l->notes,
                'overdue' => $isOverdue,
                'daysOverdue' => $daysOverdue,
            ];
        }

        return [
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'phone' => $customer->phone,
                'email' => $customer->email,
                'creditLimit' => $creditLimit,
                'availableCredit' => $availableCredit,
                'totalOutstanding' => $totalOutstanding,
                'totalPaid' => $totalPaid,
                'openInvoicesCount' => $openInvoicesCount,
                'overdueAmount' => $overdueAmount,
                'oldestDueDate' => $oldestDueDate,
                'averageCollectionDays' => $avgCollectionDays,
                'lastPaymentDate' => $lastPaymentDate,
            ],
            'invoices' => $invoices,
            'timeline' => $timeline,
        ];
    }

    public function recordCreditPayment(?string $customerId, ?string $ledgerId, float $amount, string $method, ?string $reference, string $staffId): array
    {
        if ($amount <= 0) {
            throw new \Exception('Payment amount must be greater than zero.', 400);
        }

        return DB::transaction(function () use ($customerId, $ledgerId, $amount, $method, $reference, $staffId) {
            // Single Invoice Mode
            if ($ledgerId && $ledgerId !== 'TOTAL_PAY') {
                $ledger = CreditLedger::where('id', $ledgerId)->lockForUpdate()->first();
                if (!$ledger) throw new \Exception('Credit ledger entry not found.', 404);

                $outstanding = (float)$ledger->outstandingAmount;
                if ($outstanding <= 0) {
                    throw new \Exception('This invoice has already been fully paid.', 400);
                }

                // Idempotency check (within 15 seconds)
                $recent = CreditPayment::where('creditLedgerId', $ledger->id)
                    ->where('method', $method)
                    ->where('amount', $amount)
                    ->where('paidAt', '>=', date('Y-m-d H:i:s', time() - 15))
                    ->first();
                if ($recent) {
                    return [$recent->toArray()];
                }

                if ($amount > $outstanding) {
                    throw new \Exception("Payment amount (₹{$amount}) cannot exceed outstanding balance of ₹{$outstanding}.", 400);
                }

                $newOutstanding = max(0, $outstanding - $amount);
                $nextStatus = ($newOutstanding == 0) ? 'PAID' : 'PARTIAL';

                $payment = CreditPayment::create([
                    'id' => (string)Str::uuid(),
                    'creditLedgerId' => $ledger->id,
                    'amount' => $amount,
                    'method' => $method,
                    'reference' => $reference,
                    'paidAt' => now(),
                    'receivedById' => $staffId,
                ]);

                $ledger->outstandingAmount = $newOutstanding;
                $ledger->settlementStatus = $nextStatus;
                $ledger->updatedById = $staffId;
                $ledger->save();

                // Sync to Bill & Order
                $bill = Bill::where('invoiceNumber', $ledger->invoiceNumber)->first();
                if ($bill) {
                    $bill->paymentStatus = ($nextStatus === 'PAID') ? 'PAID' : 'PARTIALLY_PAID';
                    $bill->status = ($nextStatus === 'PAID') ? 'PAID' : 'FINALIZED';
                    $bill->save();

                    if ($bill->tableSessionId) {
                        Order::where('tableSessionId', $bill->tableSessionId)->update([
                            'paymentStatus' => ($nextStatus === 'PAID') ? 'PAID' : 'PARTIALLY_PAID'
                        ]);
                    } elseif ($bill->orderId) {
                        Order::where('id', $bill->orderId)->update([
                            'paymentStatus' => ($nextStatus === 'PAID') ? 'PAID' : 'PARTIALLY_PAID'
                        ]);
                    }
                }

                AuditLog::create([
                    'id' => (string)Str::uuid(),
                    'staffId' => $staffId,
                    'action' => 'CREDIT_PAYMENT_RECEIVE',
                    'entityType' => 'CreditPayment',
                    'entityId' => $payment->id,
                    'newData' => json_encode([
                        'ledgerId' => $ledger->id,
                        'amount' => $amount,
                        'method' => $method,
                        'newOutstanding' => $newOutstanding,
                        'status' => $nextStatus,
                    ]),
                    'createdAt' => now(),
                ]);

                return [$payment->toArray()];
            }

            // TOTAL_PAY FIFO Distribution Mode
            $targetCustomerId = $customerId;
            if (!$targetCustomerId && $ledgerId) {
                $singleL = CreditLedger::find($ledgerId);
                if ($singleL) $targetCustomerId = $singleL->customerId;
            }

            if (!$targetCustomerId) {
                throw new \Exception('Customer ID is required to process total payment.', 400);
            }

            $activeLedgers = CreditLedger::where('customerId', $targetCustomerId)
                ->whereIn('settlementStatus', ['UNPAID', 'PARTIAL'])
                ->orderBy('dueDate', 'asc')
                ->orderBy('invoiceDate', 'asc')
                ->lockForUpdate()
                ->get();

            if ($activeLedgers->count() === 0) {
                throw new \Exception('This customer has no outstanding credit invoices.', 400);
            }

            $totalCustomerOutstanding = (float)$activeLedgers->sum('outstandingAmount');
            if ($amount > $totalCustomerOutstanding) {
                throw new \Exception("Payment amount (₹{$amount}) cannot exceed total customer outstanding balance of ₹{$totalCustomerOutstanding}.", 400);
            }

            $remainingToAllocate = $amount;
            $createdPayments = [];

            foreach ($activeLedgers as $ledger) {
                if ($remainingToAllocate <= 0) break;

                $ledgerOutstanding = (float)$ledger->outstandingAmount;
                $allocateAmount = min($remainingToAllocate, $ledgerOutstanding);
                $newOutstanding = max(0, $ledgerOutstanding - $allocateAmount);
                $nextStatus = ($newOutstanding == 0) ? 'PAID' : 'PARTIAL';

                $payment = CreditPayment::create([
                    'id' => (string)Str::uuid(),
                    'creditLedgerId' => $ledger->id,
                    'amount' => $allocateAmount,
                    'method' => $method,
                    'reference' => $reference,
                    'paidAt' => now(),
                    'receivedById' => $staffId,
                ]);
                $createdPayments[] = $payment->toArray();

                $ledger->outstandingAmount = $newOutstanding;
                $ledger->settlementStatus = $nextStatus;
                $ledger->updatedById = $staffId;
                $ledger->save();

                $bill = Bill::where('invoiceNumber', $ledger->invoiceNumber)->first();
                if ($bill) {
                    $bill->paymentStatus = ($nextStatus === 'PAID') ? 'PAID' : 'PARTIALLY_PAID';
                    $bill->status = ($nextStatus === 'PAID') ? 'PAID' : 'FINALIZED';
                    $bill->save();

                    if ($bill->tableSessionId) {
                        Order::where('tableSessionId', $bill->tableSessionId)->update([
                            'paymentStatus' => ($nextStatus === 'PAID') ? 'PAID' : 'PARTIALLY_PAID'
                        ]);
                    } elseif ($bill->orderId) {
                        Order::where('id', $bill->orderId)->update([
                            'paymentStatus' => ($nextStatus === 'PAID') ? 'PAID' : 'PARTIALLY_PAID'
                        ]);
                    }
                }

                AuditLog::create([
                    'id' => (string)Str::uuid(),
                    'staffId' => $staffId,
                    'action' => 'CREDIT_PAYMENT_RECEIVE',
                    'entityType' => 'CreditPayment',
                    'entityId' => $payment->id,
                    'newData' => json_encode([
                        'ledgerId' => $ledger->id,
                        'amount' => $allocateAmount,
                        'method' => $method,
                        'newOutstanding' => $newOutstanding,
                        'status' => $nextStatus,
                    ]),
                    'createdAt' => now(),
                ]);

                $remainingToAllocate -= $allocateAmount;
            }

            return $createdPayments;
        });
    }

    public function getCreditAnalytics(): array
    {
        $now = time();
        $startOfToday = date('Y-m-d 00:00:00');
        $startOfWeek = date('Y-m-d 00:00:00', strtotime('-7 days'));
        $startOfMonthly = date('Y-m-d 00:00:00', strtotime('-30 days'));

        $activeLedgers = CreditLedger::with('customer')
            ->whereIn('settlementStatus', ['UNPAID', 'PARTIAL'])
            ->get();

        $totalOutstanding = (float)$activeLedgers->sum('outstandingAmount');

        $todaysCreditSales = (float)CreditLedger::where('creditDate', '>=', $startOfToday)->sum('billAmount');
        $todaysCreditCollections = (float)CreditPayment::where('paidAt', '>=', $startOfToday)->sum('amount');
        $weeklyCollections = (float)CreditPayment::where('paidAt', '>=', $startOfWeek)->sum('amount');
        $monthlyCollections = (float)CreditPayment::where('paidAt', '>=', $startOfMonthly)->sum('amount');

        $overdueLedgers = $activeLedgers->filter(fn($l) => $l->dueDate && strtotime($l->dueDate) < $now);
        $overdueCustomers = $overdueLedgers->pluck('customerId')->unique()->count();

        $customerOutstandingMap = [];
        foreach ($activeLedgers as $l) {
            $cId = $l->customerId;
            if (!isset($customerOutstandingMap[$cId])) {
                $customerOutstandingMap[$cId] = ['name' => $l->customer->name ?? 'Unknown', 'outstanding' => 0.0];
            }
            $customerOutstandingMap[$cId]['outstanding'] += (float)$l->outstandingAmount;
        }

        $largestCustomer = 'None';
        $largestAmount = 0.0;
        foreach ($customerOutstandingMap as $c) {
            if ($c['outstanding'] > $largestAmount) {
                $largestAmount = $c['outstanding'];
                $largestCustomer = "{$c['name']} (Rs. {$c['outstanding']})";
            }
        }

        $paidLedgers = CreditLedger::with(['payments' => function ($q) {
            $q->orderBy('paidAt', 'desc')->take(1);
        }])->where('settlementStatus', 'PAID')->get();

        $totalPeriodDays = 0;
        $paidCount = 0;

        foreach ($paidLedgers as $l) {
            if ($l->payments->count() > 0) {
                $pDate = strtotime($l->payments[0]->paidAt);
                $iDate = strtotime($l->invoiceDate);
                $diffDays = (int)ceil(abs($pDate - $iDate) / 86400);
                $totalPeriodDays += $diffDays;
                $paidCount++;
            }
        }

        $avgCreditPeriod = $paidCount > 0 ? (int)round($totalPeriodDays / $paidCount) : 0;

        $customerSummaries = [];
        foreach ($customerOutstandingMap as $id => $val) {
            $customerSummaries[] = [
                'id' => $id,
                'name' => $val['name'],
                'outstanding' => $val['outstanding'],
            ];
        }

        return [
            'totalOutstanding' => $totalOutstanding,
            'todaysCreditSales' => $todaysCreditSales,
            'todaysCreditCollections' => $todaysCreditCollections,
            'weeklyCollections' => $weeklyCollections,
            'monthlyCollections' => $monthlyCollections,
            'overdueCustomers' => $overdueCustomers,
            'largestOutstandingCustomer' => $largestCustomer,
            'averageCreditPeriod' => $avgCreditPeriod,
            'customerSummaries' => $customerSummaries,
        ];
    }
}
