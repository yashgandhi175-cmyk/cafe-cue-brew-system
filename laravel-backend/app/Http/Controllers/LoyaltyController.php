<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\LoyaltyService;
use App\Http\Requests\AdjustLoyaltyRequest;
use App\Http\Requests\CreateRedemptionRequest;

class LoyaltyController extends Controller
{
    protected $loyaltyService;

    public function __construct(LoyaltyService $loyaltyService)
    {
        $this->loyaltyService = $loyaltyService;
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

    public function getProfile(Request $request, string $id)
    {
        try {
            return $this->respond($this->loyaltyService->getLoyaltyProfile($id));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function getTransactions(Request $request, string $id)
    {
        $page = (int)$request->query('page', 1);
        $limit = (int)$request->query('limit', 20);
        try {
            return $this->respond($this->loyaltyService->getTransactions($id, $page, $limit));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function adjustPoints(AdjustLoyaltyRequest $request, string $id)
    {
        try {
            return $this->respond($this->loyaltyService->adjustPoints($id, $request->validated(), $this->getStaffId($request)), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function analytics(Request $request)
    {
        try {
            return $this->respond($this->loyaltyService->getAnalytics($this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function listRedemptionRequests(Request $request)
    {
        try {
            return $this->respond($this->loyaltyService->listRedemptionRequests($request->only(['billId', 'customerId', 'status'])));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function createRedemptionRequest(CreateRedemptionRequest $request)
    {
        try {
            return $this->respond($this->loyaltyService->createRedemptionRequest($request->validated()), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function getRedemptionRequest(Request $request, string $id)
    {
        try {
            return $this->respond($this->loyaltyService->getRedemptionRequest($id));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function approveRedemptionRequest(Request $request, string $id)
    {
        try {
            return $this->respond($this->loyaltyService->approveRedemptionRequest($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function rejectRedemptionRequest(Request $request, string $id)
    {
        try {
            return $this->respond($this->loyaltyService->rejectRedemptionRequest($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function cancelRedemptionRequest(Request $request, string $id)
    {
        try {
            return $this->respond($this->loyaltyService->cancelRedemptionRequest($id));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }
}
