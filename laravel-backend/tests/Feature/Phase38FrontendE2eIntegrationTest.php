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
use App\Models\Supplier;
use App\Models\Purchase;
use App\Models\PurchaseItem;
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
use Illuminate\Support\Str;

class Phase38FrontendE2eIntegrationTest extends TestCase
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
            'name' => "Staff {$role} P38",
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
    // 1. FULL BUSINESS LIFECYCLE E2E INTEGRATION
    // ==========================================

    public function test_full_business_lifecycle_end_to_end_integration()
    {
        // A. Setup Ingredient, Category, Menu Item & BOM Recipe
        $ing = Ingredient::create([
            'id' => (string)Str::uuid(),
            'name' => 'Cold Brew Coffee Beans P38 ' . rand(100000, 999999),
            'unit' => 'GM',
            'currentStock' => 10000.0,
            'averageCost' => 1.5,
        ]);

        $cat = Category::create(['id' => (string)Str::uuid(), 'name' => 'Beverages P38 ' . rand(1000, 9999), 'sortOrder' => 1, 'isActive' => true]);
        $item = MenuItem::create([
            'id' => (string)Str::uuid(),
            'categoryId' => $cat->id,
            'name' => 'Nitro Cold Brew P38 ' . rand(1000, 9999),
            'basePrice' => 200.0,
            'taxRate' => 5.0,
            'available' => true,
        ]);

        $recipe = Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 25.0, // 25g per drink
        ]);

        $table = RestaurantTable::create([
            'id' => (string)Str::uuid(),
            'tableNumber' => 'T-38-' . rand(100, 999),
            'capacity' => 4,
            'status' => 'AVAILABLE',
            'qrToken' => 'TOKEN_38_' . rand(1000, 9999),
        ]);

        // B. Customer Creation & Marketing Consent
        $customer = Customer::create([
            'id' => (string)Str::uuid(),
            'name' => 'Integration Customer P38',
            'phone' => '+9199' . rand(10000000, 99999999),
            'status' => 'ACTIVE',
            'marketingConsent' => true,
            'loyaltyPoints' => 50,
        ]);

        // C. Create POS Order
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

        // D. Finalize Bill & Calculate GST
        $finRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson("/api/billing/orders/{$orderId}/finalize");
        $finRes->assertStatus(200);
        $billId = $finRes->json('id');
        $grandTotal = (float)$finRes->json('grandTotal');
        $this->assertEquals(400.0, $grandTotal); // 400 subtotal (GST inclusive) = 400

        // E. Take Payment & Verify Automatic Completion + Inventory Stock Deduction
        $payRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/payments', [
            'billId' => $billId,
            'amount' => $grandTotal,
            'method' => 'CASH',
            'amountTendered' => 500.0,
        ]);
        $payRes->assertStatus(201)
            ->assertJson(['changeDue' => 100.0]);

        // Verify Inventory Stock Deduction (25g * 2 = 50g deducted from 10000g = 9950g)
        $freshIng = Ingredient::find($ing->id);
        $this->assertEquals(9950.0, (float)$freshIng->currentStock);

        // Verify Stock Transaction Record
        $tx = StockTransaction::where('ingredientId', $ing->id)->where('type', 'RECIPE_CONSUMPTION')->first();
        $this->assertNotNull($tx);
        $this->assertEquals(-50.0, (float)$tx->quantityChange);

        // F. Loyalty Points Awarding & Adjustment
        $loyRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->postJson("/api/customers/{$customer->id}/loyalty/adjust", [
            'pointsChange' => 20,
            'reason' => 'Bonus points P38',
            'idempotencyKey' => (string)Str::uuid(),
        ]);
        $loyRes->assertStatus(201);

        // G. Clean up
        StockTransaction::where('ingredientId', $ing->id)->delete();
        $recipe->delete();
        $ing->delete();
        $table->delete();
        $customer->delete();
    }

    // ==========================================
    // 2. PUBLIC QR ORDERING & TRACKING INTEGRATION
    // ==========================================

    public function test_public_qr_ordering_and_tracking_integration()
    {
        $table = RestaurantTable::create([
            'id' => (string)Str::uuid(),
            'tableNumber' => 'QR-T-' . rand(100, 999),
            'capacity' => 2,
            'status' => 'AVAILABLE',
            'isActive' => true,
        ]);

        $qrToken = \App\Models\TableQrToken::create([
            'id' => (string)Str::uuid(),
            'tableId' => $table->id,
            'token' => 'QR_TOKEN_P38_' . rand(1000, 9999),
            'createdAt' => now(),
        ]);

        // Validate Table Token
        $valRes = $this->getJson("/api/public/tables/{$qrToken->token}");
        $valRes->assertStatus(200)
            ->assertJson(['id' => $table->id]);

        // Submit Waiter Call
        $callRes = $this->postJson("/api/public/tables/{$table->id}/call-waiter", [
            'type' => 'WATER',
        ]);
        $callRes->assertStatus(201);

        \App\Models\WaiterCall::where('tableId', $table->id)->delete();
        $qrToken->delete();
        $table->delete();
    }

    // ==========================================
    // 3. WHATSAPP MARKETING QUEUE INTEGRATION
    // ==========================================

    public function test_whatsapp_marketing_queue_integration()
    {
        $optInCust = Customer::create([
            'id' => (string)Str::uuid(),
            'name' => 'Marketing OptIn Customer P38',
            'phone' => '+9196' . rand(10000000, 99999999),
            'status' => 'ACTIVE',
            'marketingConsent' => true,
        ]);

        $campaign = Campaign::create([
            'id' => (string)Str::uuid(),
            'name' => 'Marketing Integration Test P38',
            'type' => 'WHATSAPP',
            'templateId' => 'tpl_p38',
            'targetSegmentRule' => ['rules' => []],
            'scheduledAt' => date('Y-m-d H:i:s', time() + 3600),
            'createdByStaffId' => $this->owner->id,
            'status' => 'QUEUED',
        ]);

        $job = MarketingQueueJob::create([
            'id' => (string)Str::uuid(),
            'campaignId' => $campaign->id,
            'customerId' => $optInCust->id,
            'recipientAddress' => $optInCust->phone,
            'payload' => ['message' => 'Hello P38'],
            'status' => 'PENDING',
            'attempts' => 0,
            'runAfter' => now(),
        ]);

        // Process Queue Batch
        $procRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/marketing/queue/process?batchSize=10');
        $procRes->assertStatus(200)
            ->assertJson(['completed' => 1]);

        MarketingQueueJob::where('campaignId', $campaign->id)->delete();
        CampaignDeliveryLog::where('campaignId', $campaign->id)->delete();
        $campaign->delete();
        $optInCust->delete();
    }
}
