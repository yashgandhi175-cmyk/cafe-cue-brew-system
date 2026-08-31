<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\ExpenseService;
use App\Http\Requests\StoreExpenseRequest;
use App\Http\Requests\UpdateExpenseRequest;
use App\Http\Requests\VoidExpenseRequest;

class ExpenseController extends Controller
{
    protected $expenseService;

    public function __construct(ExpenseService $expenseService)
    {
        $this->expenseService = $expenseService;
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
            return $this->respond($this->expenseService->findAllExpenses($this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function store(StoreExpenseRequest $request)
    {
        try {
            return $this->respond($this->expenseService->createExpense($request->validated(), $this->getStaffId($request)), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function export(Request $request)
    {
        try {
            $csv = $this->expenseService->exportExpensesCsv($this->getStaffId($request));
            return response($csv, 200)
                ->header('Content-Type', 'text/csv')
                ->header('Content-Disposition', 'attachment; filename=expenses.csv');
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function show(Request $request, string $id)
    {
        try {
            return $this->respond($this->expenseService->findOneExpense($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function update(UpdateExpenseRequest $request, string $id)
    {
        try {
            return $this->respond($this->expenseService->updateExpense($id, $request->validated(), $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function destroy(Request $request, string $id)
    {
        try {
            $this->expenseService->deleteExpense($id, $this->getStaffId($request));
            return response()->noContent();
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function void(VoidExpenseRequest $request, string $id)
    {
        try {
            return $this->respond($this->expenseService->voidExpense($id, $request->validated(), $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }
}
