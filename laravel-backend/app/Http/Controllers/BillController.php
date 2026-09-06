<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\BillingService;
use App\Services\CouponService;
use App\Services\CartPricingService;
use App\Services\CustomerService;
use App\Models\Customer;

class BillController extends Controller
{
    protected $billingService;
    protected $couponService;
    protected $cartPricingService;
    protected $customerService;

    public function __construct(
        BillingService $billingService,
        CouponService $couponService,
        CartPricingService $cartPricingService,
        CustomerService $customerService
    ) {
        $this->billingService = $billingService;
        $this->couponService = $couponService;
        $this->cartPricingService = $cartPricingService;
        $this->customerService = $customerService;
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
            'subtotal' => 'nullable|numeric|min:0',
            'customerId' => 'nullable|string',
            'customerPhone' => 'nullable|string',
            'items' => 'nullable|array',
        ]);

        try {
            $subtotal = isset($data['items'])
                ? $this->cartPricingService->calculateSubtotal($data['items'])
                : (float)($data['subtotal'] ?? 0);

            $customerId = $data['customerId'] ?? null;

            if (!$customerId && !empty($data['customerPhone'])) {
                $customerId = Customer::where('phone', $this->customerService->normalizePhone($data['customerPhone']))->value('id');
            }

            $coupon = $this->couponService->validate(
                $data['code'],
                $subtotal,
                $customerId
            );

            return response()->json([
                'valid' => true,
                'coupon' => $coupon,
                'subtotal' => $subtotal,
                'discount' => $coupon['discountAmount'],
            ]);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }
}
