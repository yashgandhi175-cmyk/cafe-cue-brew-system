<?php

namespace App\Http\Controllers;

use App\Services\ReportService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    protected ReportService $reportService;

    public function __construct(ReportService $reportService)
    {
        $this->reportService = $reportService;
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

    public function dailySales(Request $request)
    {
        try {
            $this->reportService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->reportService->getDailySalesReport(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate'),
                max(1, (int)$request->query('page', 1)),
                min(100, max(1, (int)$request->query('limit', 20)))
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function payments(Request $request)
    {
        try {
            $this->reportService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->reportService->getPaymentsReport(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate'),
                max(1, (int)$request->query('page', 1)),
                min(100, max(1, (int)$request->query('limit', 20)))
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function gst(Request $request)
    {
        try {
            $this->reportService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->reportService->getGSTReport(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate'),
                max(1, (int)$request->query('page', 1)),
                min(100, max(1, (int)$request->query('limit', 20)))
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function creditDue(Request $request)
    {
        try {
            $this->reportService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->reportService->getCreditDueReport(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate'),
                $request->query('filter', 'ALL'),
                max(1, (int)$request->query('page', 1)),
                min(100, max(1, (int)$request->query('limit', 20)))
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function cancellations(Request $request)
    {
        try {
            $res = $this->reportService->getCancellationsReport(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate'),
                max(1, (int)$request->query('page', 1)),
                min(100, max(1, (int)$request->query('limit', 20)))
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function orders(Request $request)
    {
        try {
            $res = $this->reportService->getOrdersReport(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate'),
                max(1, (int)$request->query('page', 1)),
                min(100, max(1, (int)$request->query('limit', 20)))
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function items(Request $request)
    {
        try {
            $res = $this->reportService->getItemSalesReport(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate'),
                max(1, (int)$request->query('page', 1)),
                min(100, max(1, (int)$request->query('limit', 20)))
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function customers(Request $request)
    {
        try {
            $res = $this->reportService->getCustomersReport(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate'),
                max(1, (int)$request->query('page', 1)),
                min(100, max(1, (int)$request->query('limit', 20)))
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function discounts(Request $request)
    {
        try {
            $this->reportService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->reportService->getDiscountsReport(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate'),
                max(1, (int)$request->query('page', 1)),
                min(100, max(1, (int)$request->query('limit', 20)))
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function coupons(Request $request)
    {
        try {
            $this->reportService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->reportService->getCouponsReport(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate'),
                max(1, (int)$request->query('page', 1)),
                min(100, max(1, (int)$request->query('limit', 20)))
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function inventoryValuation(Request $request)
    {
        try {
            $this->reportService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->reportService->getInventoryValuationReport($this->getStaffId($request));
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function expenses(Request $request)
    {
        try {
            $this->reportService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->reportService->getExpensesReport(
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate'),
                max(1, (int)$request->query('page', 1)),
                min(100, max(1, (int)$request->query('limit', 20)))
            );
            return response()->json($res);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }

    public function exportCsv(Request $request, string $type)
    {
        try {
            $this->reportService->checkFinancialAccess($this->getStaffRole($request));
            $res = $this->reportService->exportCsv(
                $type,
                $request->query('range', 'TODAY'),
                $request->query('startDate'),
                $request->query('endDate'),
                $request->query('filter', 'ALL')
            );

            return response($res['content'], 200, [
                'Content-Type' => 'text/csv',
                'Content-Disposition' => "attachment; filename=\"{$res['filename']}\"",
                'Cache-Control' => 'no-cache, no-store, must-revalidate',
                'Pragma' => 'no-cache',
                'Expires' => '0',
            ]);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400);
        }
    }
}
