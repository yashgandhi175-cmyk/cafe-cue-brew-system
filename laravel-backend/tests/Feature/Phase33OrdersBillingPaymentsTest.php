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
use App\Models\TableQrToken;
use App\Models\Order;
use App\Models\Bill;
use App\Models\Payment;
use App\Models\Coupon;
use App\Models\CouponUsage;
use App\Services\CouponService;
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

    public function test_role_boundaries_protect_order_and_billing_operations()
    {
        $posRes = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->cashierToken
        )->postJson('/api/orders/pos', [
            'orderType' => 'TAKEAWAY',
            'items' => [
                ['menuItemId' => $this->menuItem->id, 'quantity' => 1]
            ],
        ]);

        $posRes->assertStatus(201);
        $orderId = $posRes->json('id');

        // WAITER must not be able to cancel orders.
        $cancelRes = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->waiterToken
        )->postJson("/api/orders/{$orderId}/cancel", [
            'reason' => 'CUSTOMER_REQUEST',
        ]);

        $cancelRes->assertStatus(403);

        // WAITER must not be able to apply manual discounts.
        $discountRes = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->waiterToken
        )->postJson("/api/billing/orders/{$orderId}/discount", [
            'type' => 'PERCENTAGE',
            'value' => 5,
            'reason' => 'Unauthorized waiter discount attempt',
        ]);

        $discountRes->assertStatus(403);

        // WAITER must not be able to finalize bills.
        $finalizeRes = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->waiterToken
        )->postJson("/api/billing/orders/{$orderId}/finalize");

        $finalizeRes->assertStatus(403);

        // CASHIER must not be able to invoke owner status override.
        $overrideRes = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->cashierToken
        )->putJson("/api/orders/{$orderId}/status", [
            'status' => 'COMPLETED',
            'override' => true,
            'overrideReason' => 'Unauthorized cashier override attempt',
        ]);

        $overrideRes->assertStatus(400)
            ->assertJson([
                'message' => 'Only the OWNER can override status rules.',
                'statusCode' => 400,
            ]);

        // OWNER is allowed to invoke an override when a reason is supplied.
        $ownerOverrideRes = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->ownerToken
        )->putJson("/api/orders/{$orderId}/status", [
            'status' => 'COMPLETED',
            'override' => true,
            'overrideReason' => 'Authorized owner security test override',
        ]);

        $ownerOverrideRes->assertStatus(200)
            ->assertJsonPath('status', 'COMPLETED');

        Order::find($orderId)->items()->delete();
        \App\Models\OrderStockConsumption::where('orderId', $orderId)->delete();
        Bill::where('orderId', $orderId)->delete();
        Order::find($orderId)->delete();
    }
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
        Coupon::where('code', 'TESTP33WELCOME')->delete();

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
    ->assertJson([
        'valid' => true,
        'subtotal' => 200.00,
        'discount' => 50.00,
    ])
    ->assertJsonPath('coupon.discountAmount', 50);

        $coupon->delete();
    }

    public function test_coupon_lifecycle_records_usage_on_bill_finalization()
    {
        $coupon = Coupon::create([
            'id' => (string)Str::uuid(),
            'code' => 'P33LIFECYCLE',
            'type' => 'FLAT',
            'value' => 50.00,
            'minOrder' => 100.00,
            'startDate' => now()->subDay(),
            'endDate' => now()->addDay(),
            'usageLimit' => 10,
            'perCustLimit' => 1,
            'isActive' => true,
            'name' => 'Phase 3.3 Lifecycle Test',
            'usedCount' => 0,
        ]);

        $customerPhone = '987654' . rand(100000, 999999);

        $res = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->cashierToken
        )->postJson('/api/orders/pos', [
            'orderType' => 'TAKEAWAY',
            'customerName' => 'Coupon Lifecycle Customer',
            'customerPhone' => $customerPhone,
            'couponCode' => 'P33LIFECYCLE',
            'items' => [
                [
                    'menuItemId' => $this->menuItem->id,
                    'quantity' => 2,
                ],
            ],
            'idempotencyKey' => (string)Str::uuid(),
        ]);

        $res->assertStatus(201);

        $orderId = $res->json('id');

        $order = Order::find($orderId);

        $this->assertNotNull($order);
        $this->assertEquals('P33LIFECYCLE', $order->couponCode);
        $this->assertEquals(50.00, (float)$order->couponDiscount);

        $bill = Bill::where('orderId', $orderId)->first();

        $this->assertNotNull($bill);
        $this->assertEquals(50.00, (float)$bill->couponDiscount);
        $this->assertEquals($coupon->id, $bill->appliedCouponId);
        $this->assertEquals('P33LIFECYCLE', $bill->appliedCouponCode);
        $this->assertEquals('DRAFT', $bill->status);

        $finalize = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->cashierToken
        )->postJson("/api/billing/orders/{$orderId}/finalize");

        $finalize->assertStatus(200)
            ->assertJson([
                'status' => 'FINALIZED',
            ]);

        $bill->refresh();
        $coupon->refresh();

        $this->assertEquals('FINALIZED', $bill->status);
        $this->assertEquals(1, $coupon->usedCount);

        $this->assertDatabaseHas('CouponUsage', [
            'couponId' => $coupon->id,
            'orderId' => $orderId,
            'billId' => $bill->id,
            'customerId' => $order->customerId,
            'couponCodeSnapshot' => 'P33LIFECYCLE',
            'appliedDiscountSnapshot' => 50.00,
            'status' => 'ACTIVE',
        ]);

        $this->assertDatabaseHas('CustomerCouponUsageCounter', [
            'couponId' => $coupon->id,
            'customerId' => $order->customerId,
            'usageCount' => 1,
        ]);

        $usageCount = \App\Models\CouponUsage::where(
            'billId',
            $bill->id
        )->count();

        $this->assertEquals(1, $usageCount);

        \App\Models\CouponUsage::where('billId', $bill->id)->delete();
        \App\Models\CustomerCouponUsageCounter::where('couponId', $coupon->id)
            ->where('customerId', $order->customerId)
            ->delete();
        Order::find($orderId)->items()->delete();
        Bill::where('id', $bill->id)->delete();
        Order::find($orderId)->delete();
        $coupon->delete();
    }

public function test_coupon_discount_cannot_be_forged_by_client()
{
    $coupon = Coupon::create([
        'id' => (string) Str::uuid(),
        'code' => 'P33FORGED',
        'type' => 'FLAT',
        'value' => 20.00,
        'minOrder' => 100.00,
        'startDate' => now()->subDay(),
        'endDate' => now()->addDay(),
        'usageLimit' => 10,
        'perCustLimit' => 10,
        'isActive' => true,
        'name' => 'Phase 3.3 Forged Discount Test',
        'usedCount' => 0,
    ]);

    $response = $this->withHeader(
        'Authorization',
        'Bearer ' . $this->cashierToken
    )->postJson('/api/orders/pos', [
        'orderType' => 'TAKEAWAY',
        'customerName' => 'Forged Discount Test',
        'customerPhone' => '987660' . rand(100000, 999999),
        'couponCode' => $coupon->code,

        /*
         * Malicious client attempts to force a ₹9999 coupon discount.
         */
        'couponDiscount' => 9999.00,

        'items' => [
            [
                'menuItemId' => $this->menuItem->id,
                'quantity' => 2,
            ],
        ],

        'idempotencyKey' => (string) Str::uuid(),
    ]);

    $response->assertStatus(201);

    $orderId = $response->json('id');

    $order = Order::findOrFail($orderId);
    $bill = Bill::where('orderId', $orderId)->firstOrFail();

    /*
     * The server must ignore the forged couponDiscount and
     * calculate the actual coupon discount itself.
     */
    $this->assertEquals(
        20.00,
        (float) $order->couponDiscount,
        'Order must use the server-calculated coupon discount.'
    );

    $this->assertEquals(
        20.00,
        (float) $bill->couponDiscount,
        'Draft bill must use the server-calculated coupon discount.'
    );

    $this->assertNotEquals(
        9999.00,
        (float) $order->couponDiscount
    );

    $this->assertNotEquals(
        9999.00,
        (float) $bill->couponDiscount
    );

    $this->assertEquals(
        'P33FORGED',
        $order->couponCode
    );

    $this->assertEquals(
        'P33FORGED',
        $bill->appliedCouponCode
    );

    /*
     * Finalization must continue using the trusted server-side
     * coupon discount.
     */
    $finalize = $this->withHeader(
        'Authorization',
        'Bearer ' . $this->cashierToken
    )->postJson("/api/billing/orders/{$orderId}/finalize");

    $finalize->assertStatus(200);

    $bill->refresh();

    $this->assertEquals(
        20.00,
        (float) $bill->couponDiscount,
        'Finalized bill must retain the trusted coupon discount.'
    );

    $coupon->refresh();

    $this->assertEquals(
        1,
        $coupon->usedCount
    );

    $this->assertEquals(
        1,
        \App\Models\CouponUsage::where(
            'couponId',
            $coupon->id
        )->count()
    );

    /*
     * Cleanup.
     */
    \App\Models\CouponUsage::where(
        'couponId',
        $coupon->id
    )->delete();

    \App\Models\CustomerCouponUsageCounter::where(
        'couponId',
        $coupon->id
    )->delete();

    Bill::where('id', $bill->id)->delete();

    Order::find($orderId)?->items()->delete();
    Order::where('id', $orderId)->delete();

    $coupon->delete();
}

    public function test_coupon_finalization_is_idempotent_for_usage()
    {
        $coupon = Coupon::create([
            'id' => (string)Str::uuid(),
            'code' => 'P33IDEMPOTENT',
            'type' => 'FLAT',
            'value' => 25.00,
            'minOrder' => 100.00,
            'startDate' => now()->subDay(),
            'endDate' => now()->addDay(),
            'usageLimit' => 10,
            'perCustLimit' => 2,
            'isActive' => true,
            'name' => 'Phase 3.3 Idempotency Test',
            'usedCount' => 0,
        ]);

        $customerPhone = '987655' . rand(100000, 999999);

        $res = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->cashierToken
        )->postJson('/api/orders/pos', [
            'orderType' => 'TAKEAWAY',
            'customerName' => 'Coupon Idempotency Customer',
            'customerPhone' => $customerPhone,
            'couponCode' => 'P33IDEMPOTENT',
            'items' => [
                [
                    'menuItemId' => $this->menuItem->id,
                    'quantity' => 2,
                ],
            ],
            'idempotencyKey' => (string)Str::uuid(),
        ]);

        $res->assertStatus(201);

        $orderId = $res->json('id');

        $finalize1 = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->cashierToken
        )->postJson("/api/billing/orders/{$orderId}/finalize");

        $finalize1->assertStatus(200);

        $billId = $finalize1->json('id');

        $finalize2 = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->cashierToken
        )->postJson("/api/billing/orders/{$orderId}/finalize");

        $finalize2->assertStatus(200)
            ->assertJson([
                'id' => $billId,
                'status' => 'FINALIZED',
            ]);

        $coupon->refresh();

        $this->assertEquals(1, $coupon->usedCount);

        $this->assertEquals(
            1,
            \App\Models\CouponUsage::where('billId', $billId)->count()
        );

        $counter = \App\Models\CustomerCouponUsageCounter::where(
            'couponId',
            $coupon->id
        )->where(
            'customerId',
            Order::find($orderId)->customerId
        )->first();

        $this->assertNotNull($counter);
        $this->assertEquals(1, $counter->usageCount);

        \App\Models\CouponUsage::where('billId', $billId)->delete();
        \App\Models\CustomerCouponUsageCounter::where('couponId', $coupon->id)
            ->where(
                'customerId',
                Order::find($orderId)->customerId
            )
            ->delete();
        Order::find($orderId)->items()->delete();
        Bill::where('id', $billId)->delete();
        Order::find($orderId)->delete();
        $coupon->delete();
    }

   public function test_coupon_per_customer_limit_is_enforced_at_order_creation()
{
    $coupon = Coupon::create([
        'id' => (string)Str::uuid(),
        'code' => 'P33PER-' . strtoupper(Str::random(8)),
        'type' => 'FLAT',
        'value' => 20.00,
        'minOrder' => 100.00,
        'startDate' => now()->subDay(),
        'endDate' => now()->addDay(),
        'usageLimit' => 10,
        'perCustLimit' => 1,
        'isActive' => true,
        'name' => 'Phase 3.3 Per Customer Limit',
        'usedCount' => 0,
    ]);

    $customerPhone = '987656' . rand(100000, 999999);

    $createOrder = function () use ($customerPhone, $coupon) {
        return $this->withHeader(
            'Authorization',
            'Bearer ' . $this->cashierToken
        )->postJson('/api/orders/pos', [
            'orderType' => 'TAKEAWAY',
            'customerName' => 'Per Customer Limit Test',
            'customerPhone' => $customerPhone,
            'couponCode' => $coupon->code,
            'items' => [
                [
                    'menuItemId' => $this->menuItem->id,
                    'quantity' => 2,
                ],
            ],
            'idempotencyKey' => (string)Str::uuid(),
        ]);
    };

    // First order should be accepted.
    $response1 = $createOrder();
    $response1->assertStatus(201);

    $orderId1 = $response1->json('id');
    $order1 = Order::find($orderId1);

    $this->assertNotNull($order1);

    // Finalize first order so coupon usage is recorded.
    $finalize1 = $this->withHeader(
        'Authorization',
        'Bearer ' . $this->cashierToken
    )->postJson("/api/billing/orders/{$orderId1}/finalize");

    $finalize1->assertStatus(200);

    $coupon->refresh();

    $this->assertEquals(1, $coupon->usedCount);

    // Second order for the same customer should now be rejected
    // during order creation because the per-customer limit is 1.
    $response2 = $createOrder();

    $response2->assertStatus(400)
        ->assertJson([
            'message' => 'You have reached the usage limit for this coupon.',
            'statusCode' => 400,
        ]);

    // Confirm no second order was created.
    $this->assertEquals(
        1,
        Order::where('customerId', $order1->customerId)
            ->where('couponCode', $coupon->code)
            ->count()
    );

    // Coupon usage must remain exactly one.
    $coupon->refresh();

    $this->assertEquals(1, $coupon->usedCount);

    $usageCount = CouponUsage::where('couponId', $coupon->id)
        ->where('customerId', $order1->customerId)
        ->count();

    $this->assertEquals(1, $usageCount);

    // Cleanup.
    CouponUsage::where('couponId', $coupon->id)->delete();
    \App\Models\CustomerCouponUsageCounter::where('couponId', $coupon->id)->delete();

    Bill::where('orderId', $orderId1)->delete();
    Order::find($orderId1)->items()->delete();
    Order::find($orderId1)->delete();
    $coupon->delete();
}

public function test_public_order_enforces_coupon_per_customer_limit_at_order_creation()
{
    $coupon = Coupon::create([
        'id' => (string)Str::uuid(),
        'code' => 'P33PUBLIC-' . strtoupper(Str::random(8)),
        'type' => 'FLAT',
        'value' => 20.00,
        'minOrder' => 100.00,
        'startDate' => now()->subDay(),
        'endDate' => now()->addDay(),
        'usageLimit' => 10,
        'perCustLimit' => 1,
        'isActive' => true,
        'name' => 'Phase 3.3 Public Per Customer Limit',
        'usedCount' => 0,
    ]);

    $qrToken = 'P33QR-' . strtoupper(Str::random(12));

    TableQrToken::create([
        'id' => (string)Str::uuid(),
        'tableId' => $this->table->id,
        'token' => $qrToken,
        'createdAt' => now(),
    ]);

    // Enable public QR ordering for this test.
    $settings = RestaurantSettings::find('default');
    $settings->qrOrderingEnabled = true;
    $settings->save();

    $customerPhone = '987657' . rand(100000, 999999);

    $createPublicOrder = function () use ($customerPhone, $coupon, $qrToken) {
        return $this->postJson('/api/public/orders', [
            'tableId' => $this->table->id,
            'token' => $qrToken,
            'customerName' => 'Public Coupon Test',
            'customerPhone' => $customerPhone,
            'couponCode' => $coupon->code,
            'items' => [
                [
                    'menuItemId' => $this->menuItem->id,
                    'quantity' => 2,
                ],
            ],
            'idempotencyKey' => (string)Str::uuid(),
        ]);
    };

    // First public order should be accepted.
    $response1 = $createPublicOrder();
    $response1->assertStatus(201);

    $orderId1 = $response1->json('id');
    $order1 = Order::find($orderId1);

    $this->assertNotNull($order1);
    $this->assertEquals(20.00, (float)$order1->couponDiscount);
    $this->assertEquals($coupon->code, $order1->couponCode);

    // Finalize the first order so coupon usage is recorded.
    $finalize1 = $this->withHeader(
        'Authorization',
        'Bearer ' . $this->cashierToken
    )->postJson("/api/billing/orders/{$orderId1}/finalize");

    $finalize1->assertStatus(200);

    $coupon->refresh();

    $this->assertEquals(1, $coupon->usedCount);

    // Second public order for the same customer must be rejected
    // during order creation because perCustLimit = 1.
    $response2 = $createPublicOrder();

    $response2->assertStatus(400)
        ->assertJson([
            'message' => 'You have reached the usage limit for this coupon.',
            'statusCode' => 400,
        ]);

    // Only the first coupon order should exist.
    $this->assertEquals(
        1,
        Order::where('customerId', $order1->customerId)
            ->where('couponCode', $coupon->code)
            ->count()
    );

    $coupon->refresh();

    $this->assertEquals(1, $coupon->usedCount);

    $usageCount = CouponUsage::where('couponId', $coupon->id)
        ->where('customerId', $order1->customerId)
        ->count();

    $this->assertEquals(1, $usageCount);

    // Cleanup.
    CouponUsage::where('couponId', $coupon->id)->delete();
    \App\Models\CustomerCouponUsageCounter::where('couponId', $coupon->id)->delete();

    Bill::where('orderId', $orderId1)->delete();
    Order::find($orderId1)->items()->delete();
    Order::find($orderId1)->delete();
    $coupon->delete();
    TableQrToken::where('tableId', $this->table->id)
        ->where('token', $qrToken)
        ->delete();
}

    public function test_coupon_global_usage_limit_is_enforced_at_finalization()
    {
        $coupon = Coupon::create([
            'id' => (string) Str::uuid(),
            'code' => 'P33GLOBAL',
            'type' => 'FLAT',
            'value' => 20.00,
            'minOrder' => 100.00,
            'startDate' => now()->subDay(),
            'endDate' => now()->addDay(),
            'usageLimit' => 1,
            'perCustLimit' => 10,
            'isActive' => true,
            'name' => 'Phase 3.3 Global Limit',
            'usedCount' => 0,
        ]);

        $createOrder = function (string $phone) use ($coupon) {
            $response = $this->withHeader(
                'Authorization',
                'Bearer ' . $this->cashierToken
            )->postJson('/api/orders/pos', [
                'orderType' => 'TAKEAWAY',
                'customerName' => 'Global Limit Test',
                'customerPhone' => $phone,
                'couponCode' => $coupon->code,
                'items' => [
                    [
                        'menuItemId' => $this->menuItem->id,
                        'quantity' => 2,
                    ],
                ],
                'idempotencyKey' => (string) Str::uuid(),
            ]);

            $response->assertStatus(201);

            return $response->json('id');
        };

        /*
         * Create both orders before either one is finalized.
         * The coupon usage count is still zero, so both orders
         * legitimately pass initial validation.
         */
        $orderId1 = $createOrder('987657' . rand(100000, 999999));
        $orderId2 = $createOrder('987658' . rand(100000, 999999));

        /*
         * First finalization consumes the only global coupon usage.
         */
        $finalize1 = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->cashierToken
        )->postJson("/api/billing/orders/{$orderId1}/finalize");

        $finalize1->assertStatus(200);

        $coupon->refresh();

        $this->assertEquals(1, $coupon->usedCount);

        /*
         * Second finalization must re-check the global usage limit
         * while the coupon row is locked.
         */
        $finalize2 = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->cashierToken
        )->postJson("/api/billing/orders/{$orderId2}/finalize");

        $finalize2->assertStatus(400)
            ->assertJson([
                'message' => 'Coupon usage limit has been reached.',
                'statusCode' => 400,
            ]);

        $coupon->refresh();

        $this->assertEquals(1, $coupon->usedCount);

        $this->assertEquals(
            1,
            \App\Models\CouponUsage::where(
                'couponId',
                $coupon->id
            )->count()
        );

        $bill2 = Bill::where('orderId', $orderId2)->first();

        \App\Models\CouponUsage::where(
            'couponId',
            $coupon->id
        )->delete();

        \App\Models\CustomerCouponUsageCounter::where(
            'couponId',
            $coupon->id
        )->delete();

        Order::find($orderId1)->items()->delete();
        Order::find($orderId2)->items()->delete();

        $bill1 = Bill::where('orderId', $orderId1)->first();

        if ($bill1) {
            Bill::where('id', $bill1->id)->delete();
        }

        if ($bill2) {
            Bill::where('id', $bill2->id)->delete();
        }

        Order::find($orderId1)->delete();
        Order::find($orderId2)->delete();

        $coupon->delete();
    }
public function test_coupon_finalization_rolls_back_when_coupon_usage_fails()
{
    $coupon = Coupon::create([
        'id' => (string) Str::uuid(),
        'code' => 'P33ROLLBACK',
        'type' => 'FLAT',
        'value' => 20.00,
        'minOrder' => 100.00,
        'startDate' => now()->subDay(),
        'endDate' => now()->addDay(),
        'usageLimit' => 10,
        'perCustLimit' => 10,
        'isActive' => true,
        'name' => 'Phase 3.3 Rollback Test',
        'usedCount' => 0,
    ]);

    $response = $this->withHeader(
        'Authorization',
        'Bearer ' . $this->cashierToken
    )->postJson('/api/orders/pos', [
        'orderType' => 'TAKEAWAY',
        'customerName' => 'Rollback Test',
        'customerPhone' => '987659' . rand(100000, 999999),
        'couponCode' => $coupon->code,
        'items' => [
            [
                'menuItemId' => $this->menuItem->id,
                'quantity' => 2,
            ],
        ],
        'idempotencyKey' => (string) Str::uuid(),
    ]);

    $response->assertStatus(201);

    $orderId = $response->json('id');

    $order = Order::findOrFail($orderId);
    $bill = Bill::where('orderId', $orderId)->firstOrFail();

    $this->assertEquals(20.00, (float) $order->couponDiscount);
    $this->assertEquals(20.00, (float) $bill->couponDiscount);
    $this->assertEquals('P33ROLLBACK', $bill->appliedCouponCode);

    /*
     * Replace CouponService with a mock that fails when usage
     * is recorded. This happens inside BillingService's
     * DB::transaction(), so all changes must roll back.
     */
    $mock = \Mockery::mock(CouponService::class);

    $mock->shouldReceive('recordUsage')
        ->once()
        ->andThrow(new \Exception(
            'Forced coupon usage failure for rollback test.',
            400
        ));

    $this->app->instance(CouponService::class, $mock);

    $finalize = $this->withHeader(
        'Authorization',
        'Bearer ' . $this->cashierToken
    )->postJson("/api/billing/orders/{$orderId}/finalize");

    $finalize->assertStatus(400)
        ->assertJson([
            'message' => 'Forced coupon usage failure for rollback test.',
            'statusCode' => 400,
        ]);

    /*
     * Coupon itself must remain untouched.
     */
    $coupon->refresh();

    $this->assertEquals(
        0,
        $coupon->usedCount,
        'Coupon usedCount must roll back.'
    );

    /*
     * No usage record should exist.
     */
    $this->assertEquals(
        0,
        \App\Models\CouponUsage::where(
            'couponId',
            $coupon->id
        )->count(),
        'CouponUsage must roll back.'
    );

    /*
     * No customer usage counter should exist.
     */
    $this->assertEquals(
        0,
        \App\Models\CustomerCouponUsageCounter::where(
            'couponId',
            $coupon->id
        )->count(),
        'Customer coupon counter must roll back.'
    );

    /*
     * Bill must still be DRAFT.
     */
    $bill->refresh();

    $this->assertEquals(
        'DRAFT',
        $bill->status,
        'Bill must remain DRAFT after failed finalization.'
    );

    /*
     * Order financial state must also remain unchanged.
     */
    $order->refresh();

    $this->assertEquals(
        20.00,
        (float) $order->couponDiscount,
        'Order coupon discount must remain intact.'
    );

    /*
     * Cleanup.
     */
    Bill::where('id', $bill->id)->delete();

    Order::find($orderId)?->items()->delete();
    Order::where('id', $orderId)->delete();

    \App\Models\CouponUsage::where(
        'couponId',
        $coupon->id
    )->delete();

    \App\Models\CustomerCouponUsageCounter::where(
        'couponId',
        $coupon->id
    )->delete();

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
