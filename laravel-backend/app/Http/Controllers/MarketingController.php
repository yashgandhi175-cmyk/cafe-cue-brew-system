<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MarketingService;
use App\Services\MarketingQueueService;
use App\Http\Requests\StoreCampaignRequest;
use App\Http\Requests\UpdateCampaignRequest;

class MarketingController extends Controller
{
    protected $marketingService;
    protected $marketingQueueService;

    public function __construct(MarketingService $marketingService, MarketingQueueService $marketingQueueService)
    {
        $this->marketingService = $marketingService;
        $this->marketingQueueService = $marketingQueueService;
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
            return $this->respond($this->marketingService->getCampaigns($request->only(['status', 'type', 'search', 'page', 'limit'])));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function store(StoreCampaignRequest $request)
    {
        try {
            return $this->respond($this->marketingService->createCampaign($request->validated(), $this->getStaffId($request)), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function show(Request $request, string $id)
    {
        try {
            return $this->respond($this->marketingService->getCampaignById($id));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function update(UpdateCampaignRequest $request, string $id)
    {
        try {
            return $this->respond($this->marketingService->updateCampaign($id, $request->validated(), $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function destroy(Request $request, string $id)
    {
        try {
            return $this->respond($this->marketingService->deleteCampaign($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function queue(Request $request, string $id)
    {
        try {
            return $this->respond($this->marketingService->queueCampaign($id));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function cancel(Request $request, string $id)
    {
        try {
            return $this->respond($this->marketingService->cancelCampaign($id));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function processQueue(Request $request)
    {
        $batchSize = (int)$request->query('batchSize', $request->input('batchSize', 50));
        $executionTimeout = (int)$request->query('executionTimeout', $request->input('executionTimeout', 25));
        $timeoutMs = $executionTimeout * 1000;

        try {
            return $this->respond($this->marketingQueueService->processBatch($batchSize, $timeoutMs));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function recoverQueue(Request $request)
    {
        $timeout = (int)$request->query('timeout', $request->input('timeout', 10));
        try {
            return $this->respond($this->marketingQueueService->recoverStaleJobs($timeout));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function getQueueStatus(Request $request)
    {
        try {
            return $this->respond($this->marketingQueueService->getQueueStatus());
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function analytics(Request $request)
    {
        try {
            return $this->respond($this->marketingService->getOverviewAnalytics($request->only(['startDate', 'endDate', 'type', 'status'])));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function campaignAnalytics(Request $request, string $id)
    {
        try {
            return $this->respond($this->marketingService->getCampaignAnalytics($id));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }
}
