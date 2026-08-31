<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\PaymentService;

class PaymentController extends Controller
{
    protected $paymentService;

    public function __construct(PaymentService $paymentService)
    {
        $this->paymentService = $paymentService;
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'billId' => 'required|string|exists:Bill,id',
            'method' => 'required|string|in:CASH,UPI,CARD,CREDIT',
            'amount' => 'required|numeric|gt:0',
            'amountTendered' => 'nullable|numeric',
            'reference' => 'nullable|string',
            'paymentIdempotencyKey' => 'nullable|string',
            'creditType' => 'nullable|string|in:WEEKLY,FIFTEEN_DAYS,MONTHLY,CUSTOM',
            'dueDate' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $staff = $request->attributes->get('auth_staff');

        try {
            return response()->json($this->paymentService->recordPayment(
                $staff->id ?? 'system',
                $staff->role ?? 'CASHIER',
                $data
            ), 201);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function split(Request $request)
    {
        $data = $request->validate([
            'billId' => 'required|string|exists:Bill,id',
            'payments' => 'required|array|min:1',
            'payments.*.method' => 'required|string|in:CASH,UPI,CARD,CREDIT',
            'payments.*.amount' => 'required|numeric|gt:0',
            'payments.*.amountTendered' => 'nullable|numeric',
            'payments.*.reference' => 'nullable|string',
        ]);

        $staff = $request->attributes->get('auth_staff');

        try {
            return response()->json($this->paymentService->processSplitPayments(
                $staff->id ?? 'system',
                $staff->role ?? 'CASHIER',
                $data
            ), 201);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }
}
