<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\InventoryService;
use App\Http\Requests\StoreIngredientRequest;
use App\Http\Requests\UpdateIngredientRequest;
use App\Http\Requests\StoreRecipeRequest;
use App\Http\Requests\UpdateRecipeRequest;
use App\Http\Requests\StoreSupplierRequest;
use App\Http\Requests\UpdateSupplierRequest;
use App\Http\Requests\StorePurchaseRequest;
use App\Http\Requests\UpdatePurchaseRequest;
use App\Http\Requests\RecordWastageRequest;
use App\Http\Requests\AdjustStockRequest;
use App\Http\Requests\ReconcileStockCountRequest;

class InventoryController extends Controller
{
    protected $inventoryService;

    public function __construct(InventoryService $inventoryService)
    {
        $this->inventoryService = $inventoryService;
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

    // ==========================================
    // INGREDIENTS
    // ==========================================

    public function createIngredient(StoreIngredientRequest $request)
    {
        try {
            return $this->respond($this->inventoryService->createIngredient($request->validated(), $this->getStaffId($request)), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function ingredients(Request $request)
    {
        $active = null;
        if ($request->has('active')) {
            $active = filter_var($request->query('active'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        }
        return $this->respond($this->inventoryService->findAllIngredients($this->getStaffId($request), $active));
    }

    public function showIngredient(Request $request, string $id)
    {
        try {
            return $this->respond($this->inventoryService->findOneIngredient($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function updateIngredient(UpdateIngredientRequest $request, string $id)
    {
        try {
            return $this->respond($this->inventoryService->updateIngredient($id, $request->validated(), $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function destroyIngredient(Request $request, string $id)
    {
        try {
            $this->inventoryService->deleteIngredient($id, $this->getStaffId($request));
            return response()->noContent();
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    // ==========================================
    // RECIPES
    // ==========================================

    public function createRecipe(StoreRecipeRequest $request)
    {
        try {
            return $this->respond($this->inventoryService->createRecipe($request->validated(), $this->getStaffId($request)), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function recipes(Request $request)
    {
        return $this->respond($this->inventoryService->findAllRecipes($this->getStaffId($request)));
    }

    public function showRecipe(Request $request, string $id)
    {
        try {
            return $this->respond($this->inventoryService->findOneRecipe($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function updateRecipe(UpdateRecipeRequest $request, string $id)
    {
        try {
            return $this->respond($this->inventoryService->updateRecipe($id, $request->validated(), $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function destroyRecipe(Request $request, string $id)
    {
        try {
            $this->inventoryService->deleteRecipe($id, $this->getStaffId($request));
            return response()->noContent();
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    // ==========================================
    // SUPPLIERS
    // ==========================================

    public function createSupplier(StoreSupplierRequest $request)
    {
        try {
            return $this->respond($this->inventoryService->createSupplier($request->validated(), $this->getStaffId($request)), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function suppliers(Request $request)
    {
        return $this->respond($this->inventoryService->findAllSuppliers($this->getStaffId($request)));
    }

    public function showSupplier(Request $request, string $id)
    {
        try {
            return $this->respond($this->inventoryService->findOneSupplier($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function updateSupplier(UpdateSupplierRequest $request, string $id)
    {
        try {
            return $this->respond($this->inventoryService->updateSupplier($id, $request->validated(), $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function destroySupplier(Request $request, string $id)
    {
        try {
            $this->inventoryService->deleteSupplier($id, $this->getStaffId($request));
            return response()->noContent();
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    // ==========================================
    // PURCHASES
    // ==========================================

    public function createPurchase(StorePurchaseRequest $request)
    {
        try {
            return $this->respond($this->inventoryService->createPurchase($request->validated(), $this->getStaffId($request)), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function purchases(Request $request)
    {
        return $this->respond($this->inventoryService->findAllPurchases($this->getStaffId($request)));
    }

    public function showPurchase(Request $request, string $id)
    {
        try {
            return $this->respond($this->inventoryService->findOnePurchase($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function updatePurchase(UpdatePurchaseRequest $request, string $id)
    {
        try {
            return $this->respond($this->inventoryService->updatePurchase($id, $request->validated(), $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function destroyPurchase(Request $request, string $id)
    {
        try {
            $this->inventoryService->deletePurchase($id, $this->getStaffId($request));
            return response()->noContent();
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function finalizePurchase(Request $request, string $id)
    {
        try {
            return $this->respond($this->inventoryService->finalizePurchase($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function reversePurchase(Request $request, string $id)
    {
        try {
            return $this->respond($this->inventoryService->reversePurchase($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    // ==========================================
    // WASTAGE
    // ==========================================

    public function createWastage(RecordWastageRequest $request)
    {
        try {
            return $this->respond($this->inventoryService->createWastage($request->validated(), $this->getStaffId($request)), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function wastage(Request $request)
    {
        return $this->respond($this->inventoryService->findAllWastage($this->getStaffId($request)));
    }

    public function showWastage(Request $request, string $id)
    {
        try {
            return $this->respond($this->inventoryService->findOneWastage($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function destroyWastage(Request $request, string $id)
    {
        try {
            return $this->respond($this->inventoryService->deleteWastage($id, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    // ==========================================
    // ADJUSTMENTS & LEDGER & ANALYTICS & EXPORTS
    // ==========================================

    public function adjustStock(AdjustStockRequest $request)
    {
        try {
            return $this->respond($this->inventoryService->adjustStock($request->validated(), $this->getStaffId($request)), 201);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function reconcileStockCount(ReconcileStockCountRequest $request)
    {
        try {
            return $this->respond($this->inventoryService->reconcileStockCount($request->validated()['items'], $this->getStaffId($request)), 200);
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function stockTransactions(Request $request)
    {
        try {
            return $this->respond($this->inventoryService->getLedger($this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function valueEstimate(Request $request)
    {
        try {
            return $this->respond($this->inventoryService->getValueEstimate($this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function foodCost(Request $request)
    {
        $start = $request->query('startDate', date('Y-m-01'));
        $end = $request->query('endDate', date('Y-m-d H:i:s'));
        try {
            return $this->respond($this->inventoryService->getFoodCost($start, $end, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function wastageAnalytics(Request $request)
    {
        $start = $request->query('startDate', date('Y-m-01'));
        $end = $request->query('endDate', date('Y-m-d H:i:s'));
        try {
            return $this->respond($this->inventoryService->getWastageAnalytics($start, $end, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function operatingContribution(Request $request)
    {
        $start = $request->query('startDate', date('Y-m-01'));
        $end = $request->query('endDate', date('Y-m-d H:i:s'));
        try {
            return $this->respond($this->inventoryService->getOperatingContribution($start, $end, $this->getStaffId($request)));
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function exportLedger(Request $request)
    {
        try {
            $csv = $this->inventoryService->exportLedgerCsv($this->getStaffId($request));
            return response($csv, 200)
                ->header('Content-Type', 'text/csv')
                ->header('Content-Disposition', 'attachment; filename=ledger.csv');
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function exportStockBalance(Request $request)
    {
        try {
            $csv = $this->inventoryService->exportStockBalanceCsv($this->getStaffId($request));
            return response($csv, 200)
                ->header('Content-Type', 'text/csv')
                ->header('Content-Disposition', 'attachment; filename=stock-balance.csv');
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }

    public function exportWastage(Request $request)
    {
        try {
            $csv = $this->inventoryService->exportWastageCsv($this->getStaffId($request));
            return response($csv, 200)
                ->header('Content-Type', 'text/csv')
                ->header('Content-Disposition', 'attachment; filename=wastage.csv');
        } catch (\Exception $e) {
            return $this->handleError($e);
        }
    }
}
