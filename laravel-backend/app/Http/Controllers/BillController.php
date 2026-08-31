<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\BillingService;

class BillController extends Controller
{
    protected $billingService;

    public function __construct(BillingService $billingService)
    {
        $this->billingService = $billingService;
    }

    public function show(string $orderId)
    {
        try {
            return response()->json($this->billingService->getBillForOrder($orderId));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 404;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function finalize(Request $request, string $id)
    {
        $staff = $request->attributes->get('auth_staff');
        try {
            return response()->json($this->billingService->finalizeBill($id, $staff->id ?? 'system'));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function discount(Request $request, string $id)
    {
        $data = $request->validate([
            'type' => 'required|string|in:FLAT,PERCENTAGE',
            'value' => 'required|numeric|min:0',
            'reason' => 'required|string',
        ]);

        $staff = $request->attributes->get('auth_staff');

        try {
            return response()->json($this->billingService->applyManualDiscount(
                $id,
                $staff->id ?? 'system',
                $staff->role ?? 'CASHIER',
                $data
            ));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function validateCoupon(Request $request)
    {
        $data = $request->validate([
            'code' => 'required|string',
            'subtotal' => 'required|numeric|min:0',
            'customerId' => 'nullable|string',
        ]);

        try {
            return response()->json($this->billingService->validateCoupon(
                $data['code'],
                (float)$data['subtotal'],
                $data['customerId'] ?? null
            ));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }
}
