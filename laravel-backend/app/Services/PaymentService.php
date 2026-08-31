<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Bill;
use App\Models\Payment;
use App\Models\SplitPayment;
use App\Models\RestaurantTable;
use App\Models\RestaurantSettings;
use App\Models\AuditLog;
use App\Models\CustomerCart;
use App\Models\CustomerCartItem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PaymentService
{
    protected $calcService;

    public function __construct(FinancialCalculationService $calcService)
    {
        $this->calcService = $calcService;
    }

    public function recordPayment(string $staffId, string $staffRole, array $dto): Payment
    {
        if ($staffRole === 'WAITER') {
            throw new \Exception('Waiters are not authorized to record payments.', 403);
        }

        $amount = (float)($dto['amount'] ?? 0);
        if ($amount <= 0) {
            throw new \Exception('Payment amount must be greater than zero.', 400);
        }

        $idempotencyKey = $dto['paymentIdempotencyKey'] ?? null;
        if ($idempotencyKey) {
            $existing = Payment::where('paymentIdempotencyKey', $idempotencyKey)->first();
            if ($existing) {
                return $existing;
            }
        }

        return DB::transaction(function () use ($staffId, $staffRole, $dto, $amount, $idempotencyKey) {
            $bill = Bill::with('order')->find($dto['billId'] ?? '');
            if (!$bill) {
                throw new \Exception('Bill not found.', 404);
            }

            if ($bill->status === 'VOIDED') {
                throw new \Exception('Cannot record payment for a voided bill.', 400);
            }
            if ($bill->status === 'DRAFT') {
                throw new \Exception('Cannot record payment for an unfinalized draft bill.', 400);
            }

            $settings = RestaurantSettings::find('default');
            if (!$settings) {
                throw new \Exception('Restaurant settings not found.', 404);
            }

            $method = $dto['method'] ?? 'CASH';
            if ($method === 'CASH' && !$settings->enableCash) {
                throw new \Exception('Cash payments are currently disabled.', 400);
            }
            if ($method === 'UPI' && !$settings->enableUpi) {
                throw new \Exception('UPI payments are currently disabled.', 400);
            }
            if ($method === 'CARD' && !$settings->enableCard) {
                throw new \Exception('Card payments are currently disabled.', 400);
            }
            if ($method === 'CREDIT' && !$settings->enableCredit) {
                throw new \Exception('Credit is currently disabled.', 400);
            }

            $settledSum = (float)Payment::where('billId', $bill->id)
                ->where('isSettled', true)
                ->sum('amount');

            $grandTotal = (float)$bill->grandTotal;
            $outstanding = round($grandTotal - $settledSum, 2);

            if ($outstanding <= 0) {
                throw new \Exception('This bill has already been fully settled.', 400);
            }

            $finalSettledAmount = $amount;
            $amountTenderedVal = null;
            $changeDueVal = null;
            $isSettled = ($method !== 'CREDIT');

            if ($method === 'CASH') {
                $tenderedInput = isset($dto['amountTendered']) ? (float)$dto['amountTendered'] : $amount;
                $amountTenderedVal = $tenderedInput;

                if ($tenderedInput < $amount) {
                    throw new \Exception('Tendered cash cannot be less than the payment amount.', 400);
                }

                if ($amount > $outstanding) {
                    $finalSettledAmount = $outstanding;
                    $changeDueVal = round($tenderedInput - $outstanding, 2);
                } else {
                    $finalSettledAmount = $amount;
                    $changeDueVal = round($tenderedInput - $amount, 2);
                }
            } else {
                if ($amount > $outstanding) {
                    throw new \Exception("Payment amount cannot exceed the outstanding balance of ₹{$outstanding}.", 400);
                }
            }

            $payment = Payment::create([
                'id' => (string)Str::uuid(),
                'orderId' => $bill->orderId,
                'billId' => $bill->id,
                'method' => $method,
                'amount' => $finalSettledAmount,
                'amountTendered' => $amountTenderedVal,
                'changeDue' => $changeDueVal,
                'reference' => $dto['reference'] ?? null,
                'status' => 'COMPLETED',
                'isSettled' => $isSettled,
                'receivedById' => $staffId,
                'paymentIdempotencyKey' => $idempotencyKey,
                'paidAt' => now(),
            ]);

            // Recalculate bill payment status
            $newSettledSum = (float)Payment::where('billId', $bill->id)
                ->where('isSettled', true)
                ->sum('amount');

            $hasCredit = Payment::where('billId', $bill->id)->where('method', 'CREDIT')->exists();
            $newOutstanding = max(0, round($grandTotal - $newSettledSum, 2));

            $finalPaymentStatus = 'UNPAID';
            $finalBillStatus = 'FINALIZED';

            if ($newOutstanding <= 0.001 && $grandTotal > 0) {
                $finalPaymentStatus = 'PAID';
                $finalBillStatus = 'PAID';
            } elseif ($newSettledSum > 0 && $newOutstanding > 0) {
                $finalPaymentStatus = 'PARTIALLY_PAID';
                $finalBillStatus = 'FINALIZED';
            } elseif ($hasCredit && $newOutstanding > 0) {
                $finalPaymentStatus = 'CREDIT';
                $finalBillStatus = 'FINALIZED';
            }

            $bill->paymentStatus = $finalPaymentStatus;
            $bill->status = $finalBillStatus;
            $bill->save();

            $order = Order::find($bill->orderId);
            if ($order) {
                $order->paymentStatus = $finalPaymentStatus;

                if ($finalBillStatus === 'PAID') {
                    $order->status = 'COMPLETED';
                    app(\App\Services\OrderService::class)->deductStockForCompletedOrder($order->id, $staffId);

                    if ($order->tableId) {
                        RestaurantTable::where('id', $order->tableId)->update(['status' => 'AVAILABLE']);
                        $cart = CustomerCart::where('tableId', $order->tableId)->first();
                        if ($cart) {
                            CustomerCartItem::where('cartId', $cart->id)->delete();
                        }
                    }
                }
                $order->save();
            }

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staffId,
                'action' => 'PAYMENT_CREATE',
                'entityType' => 'Payment',
                'entityId' => $payment->id,
                'newData' => json_encode([
                    'method' => $method,
                    'amount' => $finalSettledAmount,
                    'isSettled' => $isSettled,
                    'paymentStatus' => $finalPaymentStatus,
                ]),
                'createdAt' => now(),
            ]);

            return $payment;
        });
    }

    public function processSplitPayments(string $staffId, string $staffRole, array $dto): array
    {
        if ($staffRole === 'WAITER') {
            throw new \Exception('Waiters are not authorized to record payments.', 403);
        }

        $paymentsList = $dto['payments'] ?? [];
        if (empty($paymentsList) || !is_array($paymentsList)) {
            throw new \Exception('Split payment legs list is required.', 400);
        }

        return DB::transaction(function () use ($staffId, $staffRole, $dto, $paymentsList) {
            $billId = $dto['billId'] ?? '';
            $recordedPayments = [];

            foreach ($paymentsList as $leg) {
                $legDto = array_merge($leg, ['billId' => $billId]);
                $recordedPayments[] = $this->recordPayment($staffId, $staffRole, $legDto);
            }

            return [
                'message' => 'Split payments processed successfully.',
                'payments' => $recordedPayments,
            ];
        });
    }
}
