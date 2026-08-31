<?php

namespace App\Http\Controllers;

use App\Services\AnalyticsService;
use Illuminate\Http\Request;

class AnalyticsController extends Controller
{
    protected AnalyticsService $analyticsService;

    public function __construct(AnalyticsService $analyticsService)
    {
        $this->analyticsService = $analyticsService;
    }

    private function getStaffRole(Request $request): string
    {
        $staff = $request->attributes->get('auth_staff') ?? $request->user();
        return $staff?->role ?? 'STAFF';
    }

    private function getStaffId(Request $request): string
    {
        $staff = $request->attributes->get('auth_staff') ?? $request->user();
        return $staff?->id ?? '';
    }

    public function overview(Request $request)
    {
        try {
            $this->analyticsService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->analyticsService->getOverview(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate')
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function salesTrend(Request $request)
    {
        try {
            $this->analyticsService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->analyticsService->getSalesTrend(
                $request->query('range', 'TODAY'),
                $request->query('groupBy', 'DAILY'),
                $request->query('startDate'),
                $request->query('endDate')
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function orders(Request $request)
    {
        try {
            $res = $this->analyticsService->getOrderAnalytics(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate')
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function payments(Request $request)
    {
        try {
            $this->analyticsService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->analyticsService->getPaymentAnalytics(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate')
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function discounts(Request $request)
    {
        try {
            $this->analyticsService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->analyticsService->getDiscountAnalytics(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate')
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function items(Request $request)
    {
        try {
            $res = $this->analyticsService->getItemAnalytics(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate')
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function customers(Request $request)
    {
        try {
            $res = $this->analyticsService->getCustomerAnalytics(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate')
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function orderPerformance(Request $request)
    {
        try {
            $res = $this->analyticsService->getOrderPerformance(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate')
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function waiterCalls(Request $request)
    {
        try {
            $res = $this->analyticsService->getWaiterCalls(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate')
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function tables(Request $request)
    {
        try {
            $res = $this->analyticsService->getTableAnalytics(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate')
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function coupons(Request $request)
    {
        try {
            $this->analyticsService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->analyticsService->getCouponAnalytics(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate')
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function dashboard()
    {
        return response()->json([
            'totalSales' => \App\Models\Order::where('status', 'COMPLETED')->sum('grandTotal'),
            'totalOrders' => \App\Models\Order::count(),
            'totalCustomers' => \App\Models\Customer::count(),
        ]);
    }
}
