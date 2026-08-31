<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\Customer;
use App\Models\RestaurantSettings;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\RestaurantTable;
use App\Models\Order;
use App\Models\Bill;
use App\Models\Payment;
use App\Models\Ingredient;
use App\Models\Recipe;
use App\Models\StockTransaction;
use App\Models\Expense;
use App\Models\Campaign;
use App\Models\MarketingQueueJob;
use App\Models\AuditLog;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;

class Phase37FinalParityTest extends TestCase
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
                'enableLoyalty' => true,
                'managerCanViewCustomerCRM' => true,
                'managerCanManageCustomerCRM' => true,
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
            'name' => "Staff {$role} P37",
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
    // 1. PUBLIC API SANITIZATION & SECURITY
    // ==========================================

    public function test_public_api_sanitization_and_security()
    {
        // Public Health Check
        $healthRes = $this->getJson('/api/health');
        $healthRes->assertStatus(200)
            ->assertJsonStructure(['status', 'system', 'version']);

        // Public Menu & Banners
        $menuRes = $this->getJson('/api/public/menu');
        $menuRes->assertStatus(200);

        $jsonStr = $menuRes->getContent();
        $this->assertStringNotContainsString('pinHash', $jsonStr);
        $this->assertStringNotContainsString('token', $jsonStr);
        $this->assertStringNotContainsString('password', $jsonStr);
    }

    // ==========================================
    // 2. AUTHORIZATION & AUTHENTICATION PARITY
    // ==========================================

    public function test_authorization_and_authentication_parity()
    {
        // 401 Unauthenticated
        $unauthRes = $this->getJson('/api/staff');
        $unauthRes->assertStatus(401);

        // 403 Forbidden: Waiter accessing Expenses
        $forbiddenRes = $this->withHeader('Authorization', 'Bearer ' . $this->waiterToken)->getJson('/api/expenses');
        $forbiddenRes->assertStatus(403);

        // 200 Allowed: Manager accessing Expenses
        $allowedRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->getJson('/api/expenses');
        $allowedRes->assertStatus(200);
    }

    // ==========================================
    // 3. E2E FINANCIAL CALCULATION & INVENTORY PARITY
    // ==========================================

    public function test_end_to_end_financial_calculation_and_inventory_parity()
    {
        // Create Ingredient
        $ing = Ingredient::create([
            'id' => (string)Str::uuid(),
            'name' => 'Espresso Beans P37 ' . rand(100000, 999999),
            'unit' => 'GM',
            'currentStock' => 5000.0,
            'averageCost' => 2.0,
        ]);

        // Create Category & Item
        $cat = Category::create(['id' => (string)Str::uuid(), 'name' => 'Beverages P37 ' . rand(1000, 9999), 'sortOrder' => 1, 'isActive' => true]);
        $item = MenuItem::create([
            'id' => (string)Str::uuid(),
            'categoryId' => $cat->id,
            'name' => 'Double Espresso P37 ' . rand(1000, 9999),
            'basePrice' => 150.0,
            'taxRate' => 5.0,
            'available' => true,
        ]);

        // Recipe Link
        $recipe = Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 18.0,
        ]);

        // Create POS Order
        $orderRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/orders/pos', [
            'orderType' => 'TAKEAWAY',
            'items' => [
                ['menuItemId' => $item->id, 'quantity' => 2]
            ]
        ]);
        $orderRes->assertStatus(201);
        $orderId = $orderRes->json('id');

        // Finalize Bill
        $finRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson("/api/billing/orders/{$orderId}/finalize");
        $finRes->assertStatus(200);
        $billId = $finRes->json('id');
        $grandTotal = (float)$finRes->json('grandTotal');

        // Record Payment
        $payRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/payments', [
            'billId' => $billId,
            'amount' => $grandTotal,
            'method' => 'CASH',
        ]);
        $payRes->assertStatus(201);

        // Complete Order (triggers stock deduction)
        $compRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->putJson("/api/orders/{$orderId}/status", [
            'status' => 'COMPLETED',
            'override' => true,
            'overrideReason' => 'POS completion',
        ]);
        $compRes->assertStatus(200);

        // Verify Inventory Deduction (18g * 2 = 36g)
        $freshIng = Ingredient::find($ing->id);
        $this->assertEquals(4964.0, (float)$freshIng->currentStock);

        // Clean up
        StockTransaction::where('ingredientId', $ing->id)->delete();
        $recipe->delete();
        $ing->delete();
    }

    // ==========================================
    // 4. ARTISAN COMMANDS & SCHEDULER VERIFICATION
    // ==========================================

    public function test_artisan_commands_and_scheduler_execution()
    {
        $exitCode1 = Artisan::call('marketing:process-queue', ['--batchSize' => 10]);
        $this->assertEquals(0, $exitCode1);

        $exitCode2 = Artisan::call('marketing:recover-stalled', ['--timeout' => 10]);
        $this->assertEquals(0, $exitCode2);
    }
}
