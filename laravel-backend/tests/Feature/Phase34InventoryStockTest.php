<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Ingredient;
use App\Models\Supplier;
use App\Models\Recipe;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\WastageEntry;
use App\Models\StockTransaction;
use App\Models\RestaurantSettings;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class Phase34InventoryStockTest extends TestCase
{
    protected $owner;
    protected $manager;
    protected $cashier;
    protected $waiter;

    protected $ownerToken;
    protected $managerToken;
    protected $cashierToken;
    protected $waiterToken;

    protected function setUp(): void
    {
        parent::setUp();

        RestaurantSettings::updateOrCreate(
            ['id' => 'default'],
            [
                'restaurantName' => 'Café Cue & Brew',
                'enableGst' => true,
                'gstPercentage' => 5.0,
                'enableCash' => true,
                'allowNegativeStock' => true,
                'managerCanManageInventory' => true,
                'managerCanViewInventoryCost' => true,
                'managerCanViewProfitEstimate' => true,
            ]
        );

        $this->owner = $this->createStaff('OWNER');
        $this->manager = $this->createStaff('MANAGER');
        $this->cashier = $this->createStaff('CASHIER');
        $this->waiter = $this->createStaff('WAITER');

        $this->ownerToken = $this->createStaffToken($this->owner);
        $this->managerToken = $this->createStaffToken($this->manager);
        $this->cashierToken = $this->createStaffToken($this->cashier);
        $this->waiterToken = $this->createStaffToken($this->waiter);
    }

    protected function tearDown(): void
    {
        if ($this->owner) { $this->owner->sessions()->delete(); $this->owner->delete(); }
        if ($this->manager) { $this->manager->sessions()->delete(); $this->manager->delete(); }
        if ($this->cashier) { $this->cashier->sessions()->delete(); $this->cashier->delete(); }
        if ($this->waiter) { $this->waiter->sessions()->delete(); $this->waiter->delete(); }

        parent::tearDown();
    }

    private function createStaff(string $role): Staff
    {
        $id = (string)Str::uuid();
        return Staff::create([
            'id' => $id,
            'name' => "Staff {$role} P34",
            'phone' => '+919' . rand(100000000, 999999999),
            'role' => $role,
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
        ]);
    }

    private function createStaffToken(Staff $staff): string
    {
        $sid = (string)Str::uuid();
        $token = JwtHelper::generateToken(['sub' => $staff->id, 'role' => $staff->role, 'sid' => $sid], env('JWT_SECRET', 'dev-secret-key'));
        StaffSession::create(['id' => $sid, 'staffId' => $staff->id, 'token' => hash('sha256', $token), 'expiredAt' => date('Y-m-d H:i:s', time() + 43200), 'isActive' => true, 'createdAt' => date('Y-m-d H:i:s')]);
        return $token;
    }

    // ==========================================
    // 1-3. INGREDIENTS CRUD
    // ==========================================

    public function test_create_update_delete_ingredient()
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/inventory/ingredients', [
            'name' => 'Full Cream Milk P34 ' . Str::random(8),
            'unit' => 'LITER',
            'category' => 'DAIRY',
            'minimumStock' => 5.0,
            'reorderLevel' => 10.0,
        ]);

        $res->assertStatus(201)
            ->assertJsonStructure(['id', 'name', 'unit', 'currentStock']);
        $ingId = $res->json('id');

        $this->assertDatabaseHas('StockTransaction', [
            'ingredientId' => $ingId,
            'type' => 'OPENING_STOCK',
            'notes' => 'Initial setup of ingredient.',
            'balanceBefore' => 0,
            'balanceAfter' => 0,
        ]);

        $upRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->putJson("/api/inventory/ingredients/{$ingId}", [
            'reorderLevel' => 15.0,
        ]);
        $upRes->assertStatus(200)
            ->assertJson(['reorderLevel' => 15.0]);

        $delRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->deleteJson("/api/inventory/ingredients/{$ingId}");
        $delRes->assertStatus(204);

        StockTransaction::where('ingredientId', $ingId)->delete();
        $this->assertDatabaseMissing('Ingredient', ['id' => $ingId]);
    }

    // ==========================================
    // 4-5. SUPPLIERS CRUD
    // ==========================================

    public function test_create_and_update_supplier()
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->postJson('/api/inventory/suppliers', [
            'name' => 'Amul Dairy Supplier P34 ' . Str::random(8),
            'phone' => '9876543210',
            'email' => 'supplier@amul.com',
        ]);
        $res->assertStatus(201)
            ->assertJsonStructure(['id', 'name', 'phone']);
        $supId = $res->json('id');

        $upRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->putJson("/api/inventory/suppliers/{$supId}", [
            'contactPerson' => 'Rajesh Sharma',
        ]);
        $upRes->assertStatus(200)
            ->assertJson(['contactPerson' => 'Rajesh Sharma']);

        Supplier::destroy($supId);
    }

    // ==========================================
    // 6-8. RECIPES / BOM CRUD
    // ==========================================

    public function test_create_update_and_delete_recipe()
    {
        $ing = Ingredient::create(['id' => (string)Str::uuid(), 'name' => 'Espresso Beans P34 ' . Str::random(8), 'unit' => 'GRAM']);
        $cat = Category::create(['id' => (string)Str::uuid(), 'name' => 'Coffee Cat P34', 'displayOrder' => 1]);
        $menuItem = MenuItem::create(['id' => (string)Str::uuid(), 'name' => 'Double Espresso P34', 'categoryId' => $cat->id, 'basePrice' => 120.0]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/inventory/recipes', [
            'menuItemId' => $menuItem->id,
            'ingredientId' => $ing->id,
            'quantity' => 18.0,
        ]);
        $res->assertStatus(201);
        $recipeId = $res->json('id');

        $upRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->putJson("/api/inventory/recipes/{$recipeId}", [
            'quantity' => 20.0,
        ]);
        $upRes->assertStatus(200)
            ->assertJson(['quantity' => 20.0]);

        $delRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->deleteJson("/api/inventory/recipes/{$recipeId}");
        $delRes->assertStatus(204);

        $menuItem->delete();
        $cat->delete();
        StockTransaction::where('ingredientId', $ing->id)->delete();
        $ing->delete();
    }

    // ==========================================
    // 9-18. PURCHASES, FINALIZATION & REVERSALS
    // ==========================================

    public function test_purchase_lifecycle_finalization_reversal_and_double_finalization_prevention()
    {
        $ing = Ingredient::create(['id' => (string)Str::uuid(), 'name' => 'Coffee Powder P34 ' . Str::random(8), 'unit' => 'KG', 'currentStock' => 10.0, 'averageCost' => 500.00]);
        $supplier = Supplier::create(['id' => (string)Str::uuid(), 'name' => 'WholeBean Co', 'phone' => '9999999999']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/inventory/purchases', [
            'supplierId' => $supplier->id,
            'discount' => 100.00,
            'otherCharges' => 50.00,
            'items' => [
                [
                    'ingredientId' => $ing->id,
                    'purchaseUnit' => 'KG',
                    'purchaseQuantity' => 5.0,
                    'conversionFactor' => 1.0,
                    'unitPurchaseCost' => 600.00,
                ]
            ],
        ]);

        $res->assertStatus(201);
        $purId = $res->json('id');
        $this->assertEquals('DRAFT', $res->json('status'));

        $upRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->putJson("/api/inventory/purchases/{$purId}", [
            'notes' => 'Urgent morning restock',
        ]);
        $upRes->assertStatus(200)
            ->assertJson(['notes' => 'Urgent morning restock']);

        $finRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson("/api/inventory/purchases/{$purId}/finalize");
        $finRes->assertStatus(200)
            ->assertJson(['status' => 'FINALIZED']);

        $ing->refresh();
        $this->assertEquals(15.0, (float)$ing->currentStock);

        $this->assertDatabaseHas('StockTransaction', [
            'ingredientId' => $ing->id,
            'type' => 'PURCHASE',
            'referenceId' => $purId,
            'balanceBefore' => 10.0,
            'balanceAfter' => 15.0,
        ]);

        $doubleFin = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson("/api/inventory/purchases/{$purId}/finalize");
        $doubleFin->assertStatus(400);

        $revRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson("/api/inventory/purchases/{$purId}/reverse");
        $revRes->assertStatus(200)
            ->assertJson(['status' => 'CANCELLED']);

        $ing->refresh();
        $this->assertEquals(10.0, (float)$ing->currentStock);

        $doubleRev = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson("/api/inventory/purchases/{$purId}/reverse");
        $doubleRev->assertStatus(400);

        PurchaseItem::where('purchaseId', $purId)->delete();
        Purchase::destroy($purId);
        StockTransaction::where('ingredientId', $ing->id)->update(['reversesStockTransactionId' => null]);
        StockTransaction::where('ingredientId', $ing->id)->delete();
        $ing->delete();
        $supplier->delete();
    }

    // ==========================================
    // 19-22. WASTAGE, ADJUSTMENT & LEDGER
    // ==========================================

    public function test_wastage_adjustment_and_ledger_correctness()
    {
        $ing = Ingredient::create(['id' => (string)Str::uuid(), 'name' => 'Syrup P34 ' . Str::random(8), 'unit' => 'BOTTLE', 'currentStock' => 20.0, 'averageCost' => 200.00]);

        $wastageRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/inventory/wastage', [
            'ingredientId' => $ing->id,
            'quantity' => 2.0,
            'reason' => 'Expired bottle found',
        ]);
        $wastageRes->assertStatus(201);
        $ing->refresh();
        $this->assertEquals(18.0, (float)$ing->currentStock);

        $adjRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->postJson('/api/inventory/adjust', [
            'ingredientId' => $ing->id,
            'quantityChange' => -3.0,
            'type' => 'ADJUSTMENT_OUT',
            'reason' => 'Stock audit correction',
        ]);
        $adjRes->assertStatus(201);
        $ing->refresh();
        $this->assertEquals(15.0, (float)$ing->currentStock);

        $ledgerRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->getJson('/api/inventory/ledger');
        $ledgerRes->assertStatus(200);
        $this->assertNotEmpty($ledgerRes->json());

        WastageEntry::where('ingredientId', $ing->id)->delete();
        StockTransaction::where('ingredientId', $ing->id)->delete();
        $ing->delete();
    }

    // ==========================================
    // 23-25. AUTHORIZATION & ROLE RESTRICTIONS
    // ==========================================

    public function test_inventory_authorization_role_restrictions()
    {
        $unauthRes = $this->withHeader('Authorization', 'Bearer ' . $this->waiterToken)->postJson('/api/inventory/ingredients', [
            'name' => 'Illegal Ingredient',
            'unit' => 'KG',
        ]);
        $unauthRes->assertStatus(403);

        $manRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->postJson('/api/inventory/ingredients', [
            'name' => 'Manager Sugar ' . Str::random(8),
            'unit' => 'KG',
        ]);
        $manRes->assertStatus(201);
        $ingId = $manRes->json('id');

        $ownRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/inventory/adjust', [
            'ingredientId' => $ingId,
            'quantityChange' => 5.0,
            'type' => 'ADJUSTMENT_IN',
        ]);
        $ownRes->assertStatus(201);

        StockTransaction::where('ingredientId', $ingId)->delete();
        Ingredient::destroy($ingId);
    }

    // ==========================================
    // 26-30. EXPORTS & ANALYTICS
    // ==========================================

    public function test_inventory_analytics_and_csv_exports()
    {
        $ing = Ingredient::create(['id' => (string)Str::uuid(), 'name' => 'Tea Leaves P34 ' . Str::random(8), 'unit' => 'KG', 'currentStock' => 5.0, 'averageCost' => 400.00]);

        $valRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->getJson('/api/inventory/value-estimate');
        $valRes->assertStatus(200)
            ->assertJsonStructure(['totalEstimatedValue', 'ingredients']);

        $expLedger = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->get('/api/inventory/export/ledger');
        $expLedger->assertStatus(200);
        $this->assertStringContainsString('text/csv', $expLedger->headers->get('Content-Type'));

        $expStock = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->get('/api/inventory/export/stock-balance');
        $expStock->assertStatus(200);
        $this->assertStringContainsString('text/csv', $expStock->headers->get('Content-Type'));

        StockTransaction::where('ingredientId', $ing->id)->delete();
        $ing->delete();
    }
}
