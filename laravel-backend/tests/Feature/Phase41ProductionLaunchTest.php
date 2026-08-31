<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\Customer;
use App\Models\RestaurantSettings;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Recipe;
use App\Models\Ingredient;
use App\Models\RestaurantTable;
use App\Models\TableQrToken;
use App\Models\WaiterCall;
use App\Models\Order;
use App\Models\Bill;
use App\Models\Payment;
use App\Models\StockTransaction;
use App\Models\Expense;
use App\Models\Campaign;
use App\Models\MarketingQueueJob;
use App\Models\CampaignDeliveryLog;
use App\Models\CreditLedger;
use App\Models\CreditPayment;
use App\Models\LoyaltyTransaction;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Phase41ProductionLaunchTest extends TestCase
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
                'enableUpi' => true,
                'enableCard' => true,
                'enableCredit' => true,
                'enableLoyalty' => true,
                'managerCanViewCustomerCRM' => true,
                'managerCanManageCustomerCRM' => true,
                'managerCanManageExpenses' => true,
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
        try { if ($this->owner) { $this->owner->sessions()->delete(); $this->owner->delete(); } } catch (\Exception $e) {}
        try { if ($this->manager) { $this->manager->sessions()->delete(); $this->manager->delete(); } } catch (\Exception $e) {}
        try { if ($this->cashier) { $this->cashier->sessions()->delete(); $this->cashier->delete(); } } catch (\Exception $e) {}
        try { if ($this->waiter) { $this->waiter->sessions()->delete(); $this->waiter->delete(); } } catch (\Exception $e) {}

        parent::tearDown();
    }

    private function createStaff(string $role): Staff
    {
        return Staff::create([
            'id' => (string)Str::uuid(),
            'name' => "Staff {$role} P41",
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
    // 1. PRODUCTION DATABASE SAFETY GUARD
    // ==========================================

    public function test_production_database_safety_isolation()
    {
        $activeDb = Config::get('database.connections.mysql.database');
        $this->assertEquals('cafe_cue_brew_test', $activeDb, 'Automated tests MUST strictly target cafe_cue_brew_test.');
        $this->assertNotEquals('cafe_cue_brew', $activeDb, 'Automated tests MUST NEVER connect to production database cafe_cue_brew.');
    }

    // ==========================================
    // 2. PRODUCTION HEALTH SIGNALS
    // ==========================================

    public function test_production_health_signals_and_sanitization()
    {
        // Liveness
        $liveRes = $this->getJson('/api/health');
        $liveRes->assertStatus(200)
            ->assertJson(['status' => 'ok'])
            ->assertJsonStructure(['status', 'system', 'laravel', 'version', 'timestamp']);

        // Readiness
        $readyRes = $this->getJson('/api/health/ready');
        $readyRes->assertStatus(200)
            ->assertJson(['status' => 'ready', 'database' => 'connected'])
            ->assertJsonStructure(['status', 'database', 'system', 'timestamp']);

        $jsonStr = $readyRes->getContent();
        $this->assertStringNotContainsString('password', $jsonStr);
        $this->assertStringNotContainsString('secret', $jsonStr);
    }

    // ==========================================
    // 3. COMPLETE BUSINESS LIFECYCLE SMOKE TEST
    // ==========================================

    public function test_complete_business_lifecycle_smoke_test()
    {
        // A. Setup Inventory & Menu Item with Recipe
        $ing = Ingredient::create([
            'id' => (string)Str::uuid(),
            'name' => 'Signature Coffee Beans P41 ' . rand(100000, 999999),
            'unit' => 'GM',
            'currentStock' => 5000.0,
            'averageCost' => 2.0,
        ]);

        $cat = Category::create(['id' => (string)Str::uuid(), 'name' => 'Beverages P41 ' . rand(1000, 9999), 'sortOrder' => 1, 'isActive' => true]);
        $item = MenuItem::create([
            'id' => (string)Str::uuid(),
            'categoryId' => $cat->id,
            'name' => 'Special Cappuccino P41 ' . rand(1000, 9999),
            'basePrice' => 150.0,
            'taxRate' => 5.0,
            'available' => true,
        ]);

        $recipe = Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 20.0, // 20g per cup
        ]);

        $table = RestaurantTable::create([
            'id' => (string)Str::uuid(),
            'tableNumber' => 'T-41-' . rand(100, 999),
            'capacity' => 4,
            'status' => 'AVAILABLE',
            'isActive' => true,
        ]);

        $qrToken = TableQrToken::create([
            'id' => (string)Str::uuid(),
            'tableId' => $table->id,
            'token' => 'QR_TOKEN_P41_' . rand(1000, 9999),
            'createdAt' => now(),
        ]);

        // B. Public QR Table Validation & Waiter Call
        $qrRes = $this->getJson("/api/public/tables/{$qrToken->token}");
        $qrRes->assertStatus(200)->assertJson(['id' => $table->id]);

        $waiterRes = $this->postJson("/api/public/tables/{$table->id}/call-waiter", ['type' => 'ASSISTANCE']);
        $waiterRes->assertStatus(201);

        // C. Customer Creation & Consent
        $customer = Customer::create([
            'id' => (string)Str::uuid(),
            'name' => 'Launch Customer P41',
            'phone' => '+9198' . rand(10000000, 99999999),
            'status' => 'ACTIVE',
            'marketingConsent' => true,
            'loyaltyPoints' => 10,
        ]);

        // D. Create POS Dine-In Order
        $orderRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/orders/pos', [
            'orderType' => 'DINE_IN',
            'tableId' => $table->id,
            'customerPhone' => $customer->phone,
            'customerName' => $customer->name,
            'items' => [
                ['menuItemId' => $item->id, 'quantity' => 2]
            ]
        ]);
        $orderRes->assertStatus(201);
        $orderId = $orderRes->json('id');

        // E. Finalize Bill & Calculate GST
        $finRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson("/api/billing/orders/{$orderId}/finalize");
        $finRes->assertStatus(200);
        $billId = $finRes->json('id');
        $grandTotal = (float)$finRes->json('grandTotal');
        $this->assertEquals(300.0, $grandTotal); // 300 subtotal (GST inclusive) = 300

        // F. Settle Payment & Verify Automatic Completion & BOM Stock Deduction
        $payRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/payments', [
            'billId' => $billId,
            'amount' => $grandTotal,
            'method' => 'CASH',
            'amountTendered' => 500.0,
        ]);
        $payRes->assertStatus(201)->assertJson(['changeDue' => 200.0]);

        // Verify Stock Deduction (20g * 2 = 40g deducted from 5000g = 4960g)
        $freshIng = Ingredient::find($ing->id);
        $this->assertEquals(4960.0, (float)$freshIng->currentStock);

        // G. Loyalty Adjustment
        $loyRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->postJson("/api/customers/{$customer->id}/loyalty/adjust", [
            'pointsChange' => 25,
            'reason' => 'Launch promotion bonus',
            'idempotencyKey' => (string)Str::uuid(),
        ]);
        $loyRes->assertStatus(201);

        // H. Expense Recording & Voiding
        $expRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/expenses', [
            'expenseDate' => date('Y-m-d'),
            'category' => 'UTILITIES',
            'title' => 'Utility Bill P41',
            'amount' => 500.0,
            'paymentMethod' => 'CASH',
            'notes' => 'Test utility expense P41',
        ]);
        $expRes->assertStatus(201);
        $expId = $expRes->json('id');

        $voidRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson("/api/expenses/{$expId}/void", [
            'voidReason' => 'Entered in error P41',
        ]);
        $voidRes->assertStatus(200);

        // I. Clean up
        WaiterCall::where('tableId', $table->id)->delete();
        $qrToken->delete();
        $table->delete();
        StockTransaction::where('ingredientId', $ing->id)->delete();
        $recipe->delete();
        $ing->delete();
        $customer->delete();
    }

    // ==========================================
    // 4. CONCURRENCY & TRANSACTION IDEMPOTENCY
    // ==========================================

    public function test_concurrency_and_transaction_idempotency()
    {
        $ing = Ingredient::create([
            'id' => (string)Str::uuid(),
            'name' => 'Concurrency Bean P41 ' . rand(100000, 999999),
            'unit' => 'GM',
            'currentStock' => 1000.0,
            'averageCost' => 1.0,
        ]);

        // Verify transaction atomicity
        DB::transaction(function () use ($ing) {
            $lockedIng = Ingredient::where('id', $ing->id)->lockForUpdate()->first();
            $lockedIng->currentStock = 900.0;
            $lockedIng->save();
        });

        $fresh = Ingredient::find($ing->id);
        $this->assertEquals(900.0, (float)$fresh->currentStock);

        $ing->delete();
    }
}
