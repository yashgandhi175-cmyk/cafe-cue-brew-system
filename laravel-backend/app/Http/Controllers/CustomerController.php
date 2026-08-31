<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\CustomerService;
use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Http\Requests\UpdateConsentRequest;
use App\Http\Requests\StoreTagRequest;
use App\Http\Requests\AssignTagRequest;

class CustomerController extends Controller
{
    protected $customerService;

    public function __construct(CustomerService $customerService)
    {
        $this->customerService = $customerService;
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
            return $this->respond($this->customerService->findAll($request->all(), $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function analytics(Request $request)
    {
        try {
            return $this->respond($this->customerService->getCrmAnalytics($this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function export(Request $request)
    {
        try {
            $csv = $this->customerService->exportCsv($this->getStaffId($request));
            return response($csv, 200)
                ->header('Content-Type', 'text/csv')
                ->header('Content-Disposition', 'attachment; filename=customers.csv');
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function tags(Request $request)
    {
        try {
            return $this->respond($this->customerService->findAllTags($this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function storeTag(StoreTagRequest $request)
    {
        try {
            return $this->respond($this->customerService->createTag($request->validated(), $this->getStaffId($request)), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function deactivateTag(Request $request, string $id)
    {
        try {
            return $this->respond($this->customerService->deactivateTag($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function show(Request $request, string $id)
    {
        try {
            return $this->respond($this->customerService->findOne($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function store(StoreCustomerRequest $request)
    {
        try {
            return $this->respond($this->customerService->create($request->validated(), $this->getStaffId($request)), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function update(UpdateCustomerRequest $request, string $id)
    {
        try {
            return $this->respond($this->customerService->update($id, $request->validated(), $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function updateConsent(UpdateConsentRequest $request, string $id)
    {
        try {
            return $this->respond($this->customerService->updateConsent($id, $request->validated(), $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function assignTag(AssignTagRequest $request, string $id)
    {
        try {
            return $this->respond($this->customerService->assignTag($id, $request->validated()['tagId'], $this->getStaffId($request)), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function removeTagAssignment(Request $request, string $id, string $tagId)
    {
        try {
            return $this->respond($this->customerService->removeTagAssignment($id, $tagId, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }
}
