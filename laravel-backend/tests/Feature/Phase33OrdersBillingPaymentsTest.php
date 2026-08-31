<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\MenuVariant;
use App\Models\Addon;
use App\Models\MenuItemAddon;
use App\Models\RestaurantTable;
use App\Models\Order;
use App\Models\Bill;
use App\Models\Payment;
use App\Models\Coupon;
use App\Models\AuditLog;
use App\Models\RestaurantSettings;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class Phase33OrdersBillingPaymentsTest extends TestCase
{
    protected $owner;
    protected $manager;
    protected $cashier;
    protected $waiter;

    protected $ownerToken;
    protected $managerToken;
    protected $cashierToken;
    protected $waiterToken;

    protected $category;
    protected $menuItem;
    protected $table;

    protected function setUp(): void
    {
        parent::setUp();

        RestaurantSettings::updateOrCreate(
            ['id' => 'default'],
            [
                'restaurantName' => 'Café Cue & Brew',
                'enableGst' => true,
                'gstPercentage' => 5.0,
                'cgstPercentage' => 2.5,
                'sgstPercentage' => 2.5,
                'enableCash' => true,
                'enableUpi' => true,
                'enableCard' => true,
                'enableCredit' => true,
                'cashierMaxDiscountPercent' => 10.0,
                'managerMaxDiscountPercent' => 25.0,
                'invoicePrefix' => 'CCB',
                'pinLength' => 4,
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

        $this->category = Category::create(['id' => (string)Str::uuid(), 'name' => 'POS Test Cat ' . rand(1000, 9999), 'displayOrder' => 1, 'isActive' => true]);
        $this->menuItem = MenuItem::create([
            'id' => (string)Str::uuid(),
            'name' => 'POS Item Cold Coffee ' . rand(1000, 9999),
            'categoryId' => $this->category->id,
            'basePrice' => 100.00,
            'available' => true,
            'isActive' => true,
        ]);
        $this->table = RestaurantTable::create([
            'id' => (string)Str::uuid(),
            'tableNumber' => 'POS-T' . rand(10000, 99999) . '-' . Str::random(4),
            'capacity' => 4,
            'status' => 'AVAILABLE',
            'isActive' => true,
        ]);
    }

    protected function tearDown(): void
    {
        if ($this->owner) { $this->owner->sessions()->delete(); $this->owner->delete(); }
        if ($this->manager) { $this->manager->sessions()->delete(); $this->manager->delete(); }
        if ($this->cashier) { $this->cashier->sessions()->delete(); $this->cashier->delete(); }
        if ($this->waiter) { $this->waiter->sessions()->delete(); $this->waiter->delete(); }

        if ($this->menuItem) { $this->menuItem->delete(); }
        if ($this->category) { $this->category->delete(); }
        if ($this->table) { $this->table->delete(); }

        parent::tearDown();
    }

    private function createStaff(string $role): Staff
    {
        $id = (string)Str::uuid();
        return Staff::create([
            'id' => $id,
            'name' => "Staff {$role} P33",
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
    // POS ORDER CREATION & PRICE ENFORCEMENT
    // ==========================================

    public function test_successful_pos_order_creation()
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/orders/pos', [
            'orderType' => 'DINE_IN',
            'tableId' => $this->table->id,
            'customerName' => 'Walk-in Guest',
            'customerPhone' => '9876543210',
            'items' => [
                ['menuItemId' => $this->menuItem->id, 'quantity' => 2]
            ],
            'idempotencyKey' => (string)Str::uuid(),
        ]);

        $res->assertStatus(201)
            ->assertJsonStructure(['id', 'orderNumber', 'status', 'grandTotal']);

        $orderId = $res->json('id');
        $this->assertDatabaseHas('Order', ['id' => $orderId, 'status' => 'ACCEPTED']);

        Order::find($orderId)->items()->delete();
        Bill::where('orderId', $orderId)->delete();
        Order::find($orderId)->delete();
    }

    public function test_database_price_enforcement_overrides_client_prices()
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/orders/pos', [
            'orderType' => 'TAKEAWAY',
            'customerName' => 'Attacker',
            'items' => [
                ['menuItemId' => $this->menuItem->id, 'quantity' => 2, 'price' => 0.01]
            ],
        ]);

        $res->assertStatus(201);
        $this->assertEquals(200.00, (float)$res->json('subtotal'));

        $orderId = $res->json('id');
        Order::find($orderId)->items()->delete();
        Bill::where('orderId', $orderId)->delete();
        Order::find($orderId)->delete();
    }

    public function test_order_idempotency_prevents_duplicate_orders()
    {
        $key = (string)Str::uuid();
        $payload = [
            'orderType' => 'TAKEAWAY',
            'customerName' => 'Idempotent Guest',
            'items' => [['menuItemId' => $this->menuItem->id, 'quantity' => 1]],
            'idempotencyKey' => $key,
        ];

        $res1 = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/orders/pos', $payload);
        $res1->assertStatus(201);
        $orderId1 = $res1->json('id');

        $res2 = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/orders/pos', $payload);
        $res2->assertStatus(201);
        $orderId2 = $res2->json('id');

        $this->assertEquals($orderId1, $orderId2);

        Order::find($orderId1)->items()->delete();
        Bill::where('orderId', $orderId1)->delete();
        Order::find($orderId1)->delete();
    }

    // ==========================================
    // ORDER STATE MACHINE & AUTHORIZATION
    // ==========================================

    public function test_valid_status_transition_and_live_orders()
    {
        $posRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/orders/pos', [
            'orderType' => 'DINE_IN',
            'tableId' => $this->table->id,
            'items' => [['menuItemId' => $this->menuItem->id, 'quantity' => 1]],
        ]);
        $orderId = $posRes->json('id');

        $liveRes = $this->withHeader('Authorization', 'Bearer ' . $this->waiterToken)->getJson('/api/orders/live');
        $liveRes->assertStatus(200);

        $prepRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->putJson("/api/orders/{$orderId}/status", [
            'status' => 'PREPARING',
        ]);
        $prepRes->assertStatus(200);

        $servedRes = $this->withHeader('Authorization', 'Bearer ' . $this->waiterToken)->putJson("/api/orders/{$orderId}/status", [
            'status' => 'SERVED',
        ]);
        $servedRes->assertStatus(200);

        Order::find($orderId)->items()->delete();
        Bill::where('orderId', $orderId)->delete();
        Order::find($orderId)->delete();
    }

    public function test_invalid_status_transition_rejection()
    {
        $posRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/orders/pos', [
            'orderType' => 'TAKEAWAY',
            'items' => [['menuItemId' => $this->menuItem->id, 'quantity' => 1]],
        ]);
        $orderId = $posRes->json('id');

        $badRes = $this->withHeader('Authorization', 'Bearer ' . $this->waiterToken)->putJson("/api/orders/{$orderId}/status", [
            'status' => 'COMPLETED',
        ]);
        $badRes->assertStatus(400);

        Order::find($orderId)->items()->delete();
        Bill::where('orderId', $orderId)->delete();
        Order::find($orderId)->delete();
    }

    public function test_owner_only_order_void_and_unauthorized_rejection()
    {
        $posRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/orders/pos', [
            'orderType' => 'TAKEAWAY',
            'items' => [['menuItemId' => $this->menuItem->id, 'quantity' => 1]],
        ]);
        $orderId = $posRes->json('id');

        $unauthVoid = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson("/api/orders/{$orderId}/void", [
            'reason' => 'Cashier illegal void attempt',
        ]);
        $unauthVoid->assertStatus(403);

        $ownerVoid = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson("/api/orders/{$orderId}/void", [
            'reason' => 'Spoiled preparation',
        ]);
        $ownerVoid->assertStatus(200)
            ->assertJson(['status' => 'VOIDED']);

        Order::find($orderId)->items()->delete();
        Bill::where('orderId', $orderId)->delete();
        Order::find($orderId)->delete();
    }

    // ==========================================
    // BILLING & DISCOUNTS & COUPONS
    // ==========================================

    public function test_bill_retrieval_finalization_and_discount()
    {
        $posRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/orders/pos', [
            'orderType' => 'TAKEAWAY',
            'items' => [['menuItemId' => $this->menuItem->id, 'quantity' => 2]],
        ]);
        $orderId = $posRes->json('id');

        $billRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->getJson("/api/bills/{$orderId}");
        $billRes->assertStatus(200);

        $discRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson("/api/billing/orders/{$orderId}/discount", [
            'type' => 'PERCENTAGE',
            'value' => 5,
            'reason' => 'Loyal walk-in customer',
        ]);
        $discRes->assertStatus(200)
            ->assertJson(['manualDiscount' => 10]);

        $badDisc = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson("/api/billing/orders/{$orderId}/discount", [
            'type' => 'PERCENTAGE',
            'value' => 15,
            'reason' => 'Exceeds limit',
        ]);
        $badDisc->assertStatus(403);

        $finRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson("/api/billing/orders/{$orderId}/finalize");
        $finRes->assertStatus(200)
            ->assertJsonStructure(['invoiceNumber', 'status']);
        $this->assertEquals('FINALIZED', $finRes->json('status'));

        Order::find($orderId)->items()->delete();
        Bill::where('orderId', $orderId)->delete();
        Order::find($orderId)->delete();
    }

    public function test_coupon_validation()
    {
        $coupon = Coupon::create([
            'id' => (string)Str::uuid(),
            'code' => 'TESTP33WELCOME',
            'type' => 'FLAT',
            'value' => 50.00,
            'minOrder' => 100.00,
            'startDate' => now()->subDay(),
            'endDate' => now()->addDay(),
            'isActive' => true,
        ]);

        $valRes = $this->postJson('/api/billing/coupons/validate', [
            'code' => 'TESTP33WELCOME',
            'subtotal' => 200.00,
        ]);

        $valRes->assertStatus(200)
            ->assertJson(['valid' => true, 'discountAmount' => 50.00]);

        $coupon->delete();
    }

    // ==========================================
    // PAYMENTS & SPLIT PAYMENTS
    // ==========================================

    public function test_payment_and_overpayment_rejection()
    {
        $posRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/orders/pos', [
            'orderType' => 'TAKEAWAY',
            'items' => [['menuItemId' => $this->menuItem->id, 'quantity' => 1]],
        ]);
        $orderId = $posRes->json('id');

        $finRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson("/api/billing/orders/{$orderId}/finalize");
        $billId = $finRes->json('id');
        $grandTotal = (float)$finRes->json('grandTotal');

        $overRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/payments', [
            'billId' => $billId,
            'method' => 'UPI',
            'amount' => 9999.00,
        ]);
        $overRes->assertStatus(400);

        $payRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/payments', [
            'billId' => $billId,
            'method' => 'UPI',
            'amount' => $grandTotal,
            'reference' => 'UPI-REF-12345',
        ]);

        if ($payRes->status() !== 201) { dump($payRes->json()); }
        $payRes->assertStatus(201)
            ->assertJson(['status' => 'COMPLETED']);

        $this->assertDatabaseHas('Order', ['id' => $orderId, 'status' => 'COMPLETED', 'paymentStatus' => 'PAID']);

        Payment::where('billId', $billId)->delete();
        Bill::where('id', $billId)->delete();
        \App\Models\OrderStockConsumption::where('orderId', $orderId)->delete();
        Order::find($orderId)->items()->delete();
        Order::find($orderId)->delete();
    }

    public function test_split_payments_processing()
    {
        $posRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/orders/pos', [
            'orderType' => 'TAKEAWAY',
            'items' => [['menuItemId' => $this->menuItem->id, 'quantity' => 2]],
        ]);
        $orderId = $posRes->json('id');

        $finRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson("/api/billing/orders/{$orderId}/finalize");
        $billId = $finRes->json('id');
        $grandTotal = (float)$finRes->json('grandTotal');

        $half = round($grandTotal / 2, 2);
        $rem = round($grandTotal - $half, 2);

        $splitRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/payments/split', [
            'billId' => $billId,
            'payments' => [
                ['method' => 'CASH', 'amount' => $half, 'amountTendered' => $half],
                ['method' => 'UPI', 'amount' => $rem, 'reference' => 'UPI-SPLIT-99'],
            ],
        ]);

        if ($splitRes->status() !== 201) { dump($splitRes->json()); }
        $splitRes->assertStatus(201)
            ->assertJsonStructure(['message', 'payments']);

        $this->assertDatabaseHas('Bill', ['id' => $billId, 'paymentStatus' => 'PAID']);

        Payment::where('billId', $billId)->delete();
        Bill::where('id', $billId)->delete();
        \App\Models\OrderStockConsumption::where('orderId', $orderId)->delete();
        Order::find($orderId)->items()->delete();
        Order::find($orderId)->delete();
    }
}
