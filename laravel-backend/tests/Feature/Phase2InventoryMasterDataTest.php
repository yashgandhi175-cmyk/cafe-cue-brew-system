<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Addon;
use App\Models\Ingredient;
use App\Models\Supplier;
use App\Models\Recipe;
use App\Models\StockTransaction;
use App\Models\WastageEntry;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\RestaurantSettings;
use App\Services\InventoryService;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class Phase2InventoryMasterDataTest extends TestCase
{
    protected $owner;
    protected $manager;
    protected $cashier;
    protected $ownerToken;
    protected $managerToken;

    protected function setUp(): void
    {
        parent::setUp();

        RestaurantSettings::updateOrCreate(
            ['id' => 'default'],
            [
                'restaurantName' => 'Café Cue & Brew',
                'enableGst' => true,
                'gstPercentage' => 5.0,
                'allowNegativeStock' => true,
                'managerCanManageInventory' => true,
                'managerCanViewInventoryCost' => true,
            ]
        );

        $this->owner = $this->createStaff('OWNER');
        $this->manager = $this->createStaff('MANAGER');
        $this->cashier = $this->createStaff('CASHIER');

        $this->ownerToken = $this->createStaffToken($this->owner);
        $this->managerToken = $this->createStaffToken($this->manager);
    }

    protected function tearDown(): void
    {
        if ($this->owner) {
            $purchaseIds = Purchase::where('createdById', $this->owner->id)->pluck('id')->toArray();
            if (!empty($purchaseIds)) {
                PurchaseItem::whereIn('purchaseId', $purchaseIds)->delete();
                StockTransaction::where('referenceType', 'PURCHASE')->whereIn('referenceId', $purchaseIds)->update(['reversesStockTransactionId' => null]);
                StockTransaction::where('referenceType', 'PURCHASE')->whereIn('referenceId', $purchaseIds)->delete();
                Purchase::whereIn('id', $purchaseIds)->delete();
            }

            $supplierIds = Supplier::where('name', 'like', 'Test Sup P2%')->pluck('id')->toArray();
            if (!empty($supplierIds)) {
                $sPurIds = Purchase::whereIn('supplierId', $supplierIds)->pluck('id')->toArray();
                if (!empty($sPurIds)) {
                    PurchaseItem::whereIn('purchaseId', $sPurIds)->delete();
                    StockTransaction::where('referenceType', 'PURCHASE')->whereIn('referenceId', $sPurIds)->update(['reversesStockTransactionId' => null]);
                    StockTransaction::where('referenceType', 'PURCHASE')->whereIn('referenceId', $sPurIds)->delete();
                    Purchase::whereIn('id', $sPurIds)->delete();
                }
                Ingredient::whereIn('preferredSupplierId', $supplierIds)->update(['preferredSupplierId' => null]);
                Supplier::whereIn('id', $supplierIds)->delete();
            }

            WastageEntry::where('recordedById', $this->owner->id)->delete();
            StockTransaction::where('changedById', $this->owner->id)->update(['reversesStockTransactionId' => null]);
            StockTransaction::where('changedById', $this->owner->id)->delete();

            $this->owner->sessions()->delete();
            $this->owner->delete();
        }
        if ($this->manager) { $this->manager->sessions()->delete(); $this->manager->delete(); }
        if ($this->cashier) { $this->cashier->sessions()->delete(); $this->cashier->delete(); }

        parent::tearDown();
    }

    private function createStaff(string $role): Staff
    {
        $id = (string)Str::uuid();
        return Staff::create([
            'id' => $id,
            'name' => "Staff {$role} P2",
            'phone' => '+919' . rand(100000000, 999999999),
            'role' => $role,
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
            'failedAttempts' => 0,
        ]);
    }

    private function createStaffToken(Staff $staff): string
    {
        $sid = (string)Str::uuid();
        $token = JwtHelper::generateToken([
            'sub' => $staff->id,
            'role' => $staff->role,
            'sid' => $sid,
        ], env('JWT_SECRET', 'dev-secret-key'));

        StaffSession::create([
            'id' => $sid,
            'staffId' => $staff->id,
            'token' => hash('sha256', $token),
            'expiredAt' => date('Y-m-d H:i:s', time() + 43200),
            'isActive' => true,
            'createdAt' => date('Y-m-d H:i:s'),
        ]);

        return $token;
    }

    private function createIngredient(string $name, float $stock = 100.0, float $avgCost = 2.0, bool $isActive = true): Ingredient
    {
        return Ingredient::create([
            'id' => (string)Str::uuid(),
            'name' => $name . '_' . Str::random(6),
            'unit' => 'KG',
            'category' => 'DAIRY',
            'currentStock' => $stock,
            'minimumStock' => 10.0,
            'reorderLevel' => 20.0,
            'averageCost' => $avgCost,
            'lastPurchaseCost' => $avgCost,
            'isActive' => $isActive,
        ]);
    }

    // ==========================================
    // PHASE 2A: API COMPATIBILITY
    // ==========================================

    public function test_stock_adjustment_compatibility_route_works(): void
    {
        $ing = $this->createIngredient('AdjCompat', 50.0);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->postJson('/api/inventory/ingredients/adjust', [
                'ingredientId' => $ing->id,
                'quantityChange' => 10.0,
                'type' => 'ADJUSTMENT_IN',
                'reason' => 'Frontend alias test',
            ]);

        $res->assertStatus(201);
        $ing->refresh();
        $this->assertEquals(60.0, (float)$ing->currentStock);
    }

    public function test_addon_compatibility_route_works(): void
    {
        $addon = Addon::create([
            'id' => (string)Str::uuid(),
            'name' => 'Addon Compat ' . Str::random(5),
            'price' => 20.0,
            'isActive' => true,
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/menu/addons/all');

        $res->assertStatus(200);
        $this->assertNotEmpty($res->json());
    }

    public function test_existing_routes_continue_working(): void
    {
        $ing = $this->createIngredient('AdjExisting', 40.0);

        $resAdj = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->postJson('/api/inventory/adjust', [
                'ingredientId' => $ing->id,
                'quantityChange' => -5.0,
                'type' => 'ADJUSTMENT_OUT',
                'reason' => 'Existing route test',
            ]);
        $resAdj->assertStatus(201);

        $resAddon = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/menu/addons');
        $resAddon->assertStatus(200);
    }

    // ==========================================
    // PHASE 2B: LEDGER IMMUTABILITY & WASTAGE REVERSAL
    // ==========================================

    public function test_wastage_deletion_does_not_delete_original_ledger_transaction(): void
    {
        $ing = $this->createIngredient('WastageLedger', 100.0, 5.0);
        $invService = app(InventoryService::class);

        $wastage = $invService->createWastage([
            'ingredientId' => $ing->id,
            'quantity' => 10.0,
            'reason' => 'SPOILED',
            'notes' => 'Milk spoiled',
        ], $this->owner->id);

        $ing->refresh();
        $this->assertEquals(90.0, (float)$ing->currentStock);

        $originalTx = StockTransaction::where('referenceType', 'WASTAGE')
            ->where('referenceId', $wastage->id)
            ->where('type', 'WASTAGE')
            ->first();
        $this->assertNotNull($originalTx);

        // Delete / reverse wastage
        $invService->deleteWastage($wastage->id, $this->owner->id);

        // Original transaction must STILL exist in database (immutable ledger)
        $this->assertDatabaseHas('StockTransaction', ['id' => $originalTx->id, 'type' => 'WASTAGE']);
    }

    public function test_wastage_reversal_creates_reversal_transaction_and_restores_quantity(): void
    {
        $ing = $this->createIngredient('WastageRestore', 80.0, 4.0);
        $invService = app(InventoryService::class);

        $wastage = $invService->createWastage([
            'ingredientId' => $ing->id,
            'quantity' => 15.0,
            'reason' => 'EXPIRED',
        ], $this->owner->id);

        $ing->refresh();
        $this->assertEquals(65.0, (float)$ing->currentStock);

        $originalTx = StockTransaction::where('referenceId', $wastage->id)->where('type', 'WASTAGE')->first();

        // Delete/Reverse
        $invService->deleteWastage($wastage->id, $this->owner->id);

        $ing->refresh();
        $this->assertEquals(80.0, (float)$ing->currentStock); // Restored exactly 15

        $reversalTx = StockTransaction::where('referenceId', $wastage->id)
            ->where('type', 'WASTAGE_REVERSAL')
            ->first();

        $this->assertNotNull($reversalTx);
        $this->assertEquals(15.0, (float)$reversalTx->quantityChange);
        $this->assertEquals($originalTx->id, $reversalTx->reversesStockTransactionId);
        $this->assertEquals(65.0, (float)$reversalTx->balanceBefore);
        $this->assertEquals(80.0, (float)$reversalTx->balanceAfter);
        $this->assertEquals(4.0, (float)$reversalTx->unitCostSnapshot);
        $this->assertEquals(60.0, (float)$reversalTx->totalCostSnapshot);
    }

    public function test_repeated_wastage_reversal_is_idempotent(): void
    {
        $ing = $this->createIngredient('WastageIdempotent', 50.0);
        $invService = app(InventoryService::class);

        $wastage = $invService->createWastage([
            'ingredientId' => $ing->id,
            'quantity' => 5.0,
            'reason' => 'BURNT',
        ], $this->owner->id);

        $invService->deleteWastage($wastage->id, $this->owner->id);

        $this->expectException(\Exception::class);
        $invService->deleteWastage($wastage->id, $this->owner->id); // Second attempt must fail

        $reversalCount = StockTransaction::where('referenceId', $wastage->id)
            ->where('type', 'WASTAGE_REVERSAL')
            ->count();
        $this->assertEquals(1, $reversalCount);
    }

    // ==========================================
    // PHASE 2C: MASTER DATA DELETION SAFETY
    // ==========================================

    public function test_ingredient_with_recipe_history_cannot_be_deleted(): void
    {
        $ing = $this->createIngredient('IngRecipe', 10.0);
        $cat = Category::create(['id' => (string)Str::uuid(), 'name' => 'Cat ' . Str::random(5), 'isActive' => true]);
        $item = MenuItem::create(['id' => (string)Str::uuid(), 'categoryId' => $cat->id, 'name' => 'Item ' . Str::random(5), 'basePrice' => 100.0, 'available' => true, 'isActive' => true]);

        Recipe::create(['id' => (string)Str::uuid(), 'menuItemId' => $item->id, 'ingredientId' => $ing->id, 'quantity' => 2.0]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->deleteJson("/api/inventory/ingredients/{$ing->id}");

        $res->assertStatus(400);
        $this->assertDatabaseHas('Ingredient', ['id' => $ing->id]);
    }

    public function test_ingredient_with_purchase_history_cannot_be_deleted(): void
    {
        $ing = $this->createIngredient('IngPur', 10.0);
        $sup = Supplier::create(['id' => (string)Str::uuid(), 'name' => 'Test Sup P2 ' . Str::random(5), 'phone' => '1234567890']);
        $invService = app(InventoryService::class);

        $pur = $invService->createPurchase([
            'supplierId' => $sup->id,
            'items' => [
                ['ingredientId' => $ing->id, 'purchaseUnit' => 'KG', 'purchaseQuantity' => 5.0, 'conversionFactor' => 1.0, 'unitPurchaseCost' => 10.0],
            ],
        ], $this->owner->id);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->deleteJson("/api/inventory/ingredients/{$ing->id}");

        $res->assertStatus(400);
        $this->assertDatabaseHas('Ingredient', ['id' => $ing->id]);
    }

    public function test_ingredient_with_wastage_history_cannot_be_deleted(): void
    {
        $ing = $this->createIngredient('IngWastage', 20.0);
        $invService = app(InventoryService::class);

        $invService->createWastage([
            'ingredientId' => $ing->id,
            'quantity' => 2.0,
            'reason' => 'SPILLED',
        ], $this->owner->id);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->deleteJson("/api/inventory/ingredients/{$ing->id}");

        $res->assertStatus(400);
        $this->assertDatabaseHas('Ingredient', ['id' => $ing->id]);
    }

    public function test_ingredient_with_stock_transaction_history_cannot_be_deleted(): void
    {
        $ing = $this->createIngredient('IngTx', 20.0);
        $invService = app(InventoryService::class);

        $invService->adjustStock([
            'ingredientId' => $ing->id,
            'quantityChange' => 5.0,
            'type' => 'ADJUSTMENT_IN',
        ], $this->owner->id);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->deleteJson("/api/inventory/ingredients/{$ing->id}");

        $res->assertStatus(400);
        $this->assertDatabaseHas('Ingredient', ['id' => $ing->id]);
    }

    public function test_supplier_with_purchase_history_cannot_be_deleted(): void
    {
        $ing = $this->createIngredient('SupPurIng', 10.0);
        $sup = Supplier::create(['id' => (string)Str::uuid(), 'name' => 'Test Sup P2 Pur ' . Str::random(5), 'phone' => '1234567890']);
        $invService = app(InventoryService::class);

        $invService->createPurchase([
            'supplierId' => $sup->id,
            'items' => [
                ['ingredientId' => $ing->id, 'purchaseUnit' => 'KG', 'purchaseQuantity' => 5.0, 'conversionFactor' => 1.0, 'unitPurchaseCost' => 10.0],
            ],
        ], $this->owner->id);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->deleteJson("/api/inventory/suppliers/{$sup->id}");

        $res->assertStatus(400);
        $this->assertDatabaseHas('Supplier', ['id' => $sup->id]);
    }

    public function test_supplier_with_preferred_ingredient_cannot_be_deleted(): void
    {
        $sup = Supplier::create(['id' => (string)Str::uuid(), 'name' => 'Test Sup P2 Pref ' . Str::random(5), 'phone' => '1234567890']);
        $ing = Ingredient::create([
            'id' => (string)Str::uuid(),
            'name' => 'PrefIng_' . Str::random(5),
            'unit' => 'KG',
            'currentStock' => 10.0,
            'averageCost' => 2.0,
            'preferredSupplierId' => $sup->id,
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->deleteJson("/api/inventory/suppliers/{$sup->id}");

        $res->assertStatus(400);
        $this->assertDatabaseHas('Supplier', ['id' => $sup->id]);
    }

    // ==========================================
    // PHASE 2D: PHYSICAL STOCK COUNT RECONCILIATION
    // ==========================================

    public function test_physical_stock_count_positive_and_negative_variance(): void
    {
        $ing1 = $this->createIngredient('ReconcilePos', 10.0, 3.0); // System 10, Physical 12 (+2)
        $ing2 = $this->createIngredient('ReconcileNeg', 20.0, 4.0); // System 20, Physical 17 (-3)
        $ing3 = $this->createIngredient('ReconcileZero', 15.0, 2.5); // System 15, Physical 15 (0)

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->postJson('/api/inventory/stock-count/reconcile', [
                'items' => [
                    ['ingredientId' => $ing1->id, 'physicalCount' => 12.0],
                    ['ingredientId' => $ing2->id, 'physicalCount' => 17.0],
                    ['ingredientId' => $ing3->id, 'physicalCount' => 15.0],
                ],
            ]);

        $res->assertStatus(200);
        $res->assertJson(['reconciledCount' => 3]);

        $ing1->refresh();
        $ing2->refresh();
        $ing3->refresh();

        $this->assertEquals(12.0, (float)$ing1->currentStock);
        $this->assertEquals(17.0, (float)$ing2->currentStock);
        $this->assertEquals(15.0, (float)$ing3->currentStock);

        // Check StockTransactions
        $tx1 = StockTransaction::where('ingredientId', $ing1->id)->where('type', 'STOCK_COUNT_VARIANCE')->first();
        $this->assertNotNull($tx1);
        $this->assertEquals(2.0, (float)$tx1->quantityChange);
        $this->assertEquals(10.0, (float)$tx1->balanceBefore);
        $this->assertEquals(12.0, (float)$tx1->balanceAfter);

        $tx2 = StockTransaction::where('ingredientId', $ing2->id)->where('type', 'STOCK_COUNT_VARIANCE')->first();
        $this->assertNotNull($tx2);
        $this->assertEquals(-3.0, (float)$tx2->quantityChange);
        $this->assertEquals(20.0, (float)$tx2->balanceBefore);
        $this->assertEquals(17.0, (float)$tx2->balanceAfter);

        // Zero variance must NOT create a transaction
        $tx3 = StockTransaction::where('ingredientId', $ing3->id)->where('type', 'STOCK_COUNT_VARIANCE')->first();
        $this->assertNull($tx3);
    }

    public function test_batch_reconciliation_is_atomic_and_rolls_back_on_failure(): void
    {
        $ing1 = $this->createIngredient('ReconcileAtomic1', 10.0);
        $nonExistentId = (string)Str::uuid();

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->postJson('/api/inventory/stock-count/reconcile', [
                'items' => [
                    ['ingredientId' => $ing1->id, 'physicalCount' => 15.0],
                    ['ingredientId' => $nonExistentId, 'physicalCount' => 20.0],
                ],
            ]);

        $this->assertTrue(in_array($res->status(), [400, 404, 422]));

        $ing1->refresh();
        $this->assertEquals(10.0, (float)$ing1->currentStock); // Must be rolled back to 10

        $txCount = StockTransaction::where('ingredientId', $ing1->id)->where('type', 'STOCK_COUNT_VARIANCE')->count();
        $this->assertEquals(0, $txCount);
    }

    public function test_duplicate_ingredient_ids_in_reconciliation_batch_are_rejected(): void
    {
        $ing = $this->createIngredient('ReconcileDup', 10.0);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->postJson('/api/inventory/stock-count/reconcile', [
                'items' => [
                    ['ingredientId' => $ing->id, 'physicalCount' => 12.0],
                    ['ingredientId' => $ing->id, 'physicalCount' => 14.0],
                ],
            ]);

        $res->assertStatus(400);
        $this->assertStringContainsString('Duplicate ingredient IDs', $res->json('message'));
    }

    // ==========================================
    // PHASE 2E: ACTIVE INGREDIENT FILTERING
    // ==========================================

    public function test_active_ingredient_filtering_works(): void
    {
        $activeIng = $this->createIngredient('ActiveIng', 10.0, 2.0, true);
        $inactiveIng = $this->createIngredient('InactiveIng', 10.0, 2.0, false);

        // active=true
        $resActive = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/inventory/ingredients?active=true');
        $resActive->assertStatus(200);
        $activeIds = collect($resActive->json())->pluck('id')->toArray();
        $this->assertContains($activeIng->id, $activeIds);
        $this->assertNotContains($inactiveIng->id, $activeIds);

        // active=false
        $resInactive = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/inventory/ingredients?active=false');
        $resInactive->assertStatus(200);
        $inactiveIds = collect($resInactive->json())->pluck('id')->toArray();
        $this->assertNotContains($activeIng->id, $inactiveIds);
        $this->assertContains($inactiveIng->id, $inactiveIds);

        // no active parameter preserves all
        $resAll = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/inventory/ingredients');
        $resAll->assertStatus(200);
        $allIds = collect($resAll->json())->pluck('id')->toArray();
        $this->assertContains($activeIng->id, $allIds);
        $this->assertContains($inactiveIng->id, $allIds);
    }
}
