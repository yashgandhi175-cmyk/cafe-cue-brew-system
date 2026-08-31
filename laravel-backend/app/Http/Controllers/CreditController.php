<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\CreditService;
use App\Http\Requests\RecordCreditPaymentRequest;

class CreditController extends Controller
{
    protected $creditService;

    public function __construct(CreditService $creditService)
    {
        $this->creditService = $creditService;
    }

    private function getStaffId(Request $request): string
    {
        $staff = $request->attributes->get('auth_staff');
        return $staff->id ?? 'system';
    }

    private function respond($data, int $status = 200)
    {
        return response()->json($data, $status);
    }

    private function handleError(\Exception $e)
    {
        $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
        return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
    }

    public function index(Request $request)
    {
        try {
            return $this->respond($this->creditService->getCreditsSummary($request->query('search')));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function getCreditsSummary(Request $request)
    {
        return $this->index($request);
    }

    public function getCustomerCreditDetails(Request $request, string $customerId)
    {
        try {
            return $this->respond($this->creditService->getCustomerCreditDetails($customerId));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function recordCreditPayment(RecordCreditPaymentRequest $request)
    {
        $v = $request->validated();
        try {
            return $this->respond($this->creditService->recordCreditPayment(
                $v['customerId'] ?? null,
                $v['ledgerId'] ?? null,
                (float)$v['amount'],
                $v['method'],
                $v['reference'] ?? null,
                $this->getStaffId($request)
            ), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function analytics(Request $request)
    {
        try {
            return $this->respond($this->creditService->getCreditAnalytics());
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }
}
