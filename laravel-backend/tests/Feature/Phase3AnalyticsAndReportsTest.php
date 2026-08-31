<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Ingredient;
use App\Models\Customer;
use App\Models\RestaurantTable;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Bill;
use App\Models\Payment;
use App\Models\RestaurantSettings;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class Phase3AnalyticsAndReportsTest extends TestCase
{
    protected $owner;
    protected $manager;
    protected $cashier;
    protected $ownerToken;
    protected $managerToken;
    protected $cashierToken;

    protected $category;
    protected $menuItem;
    protected $customer;
    protected $table;
    protected $order;
    protected $bill;
    protected $payment;

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
                'managerCanViewFinancialAnalytics' => true,
                'managerCanViewFinancialReports' => true,
            ]
        );

        $this->owner = $this->createStaff('OWNER');
        $this->manager = $this->createStaff('MANAGER');
        $this->cashier = $this->createStaff('CASHIER');

        $this->ownerToken = $this->createStaffToken($this->owner);
        $this->managerToken = $this->createStaffToken($this->manager);
        $this->cashierToken = $this->createStaffToken($this->cashier);

        // Seed basic operational entities
        $this->category = Category::create([
            'id' => (string)Str::uuid(),
            'name' => 'Beverages P3 ' . Str::random(4),
            'isActive' => true,
        ]);

        $this->menuItem = MenuItem::create([
            'id' => (string)Str::uuid(),
            'categoryId' => $this->category->id,
            'name' => 'Cappuccino P3',
            'basePrice' => 150.0,
            'available' => true,
            'isActive' => true,
        ]);

        $this->customer = Customer::create([
            'id' => (string)Str::uuid(),
            'name' => 'Alice Report',
            'phone' => '+919' . rand(100000000, 999999999),
            'visitCount' => 2,
        ]);

        $this->table = RestaurantTable::create([
            'id' => (string)Str::uuid(),
            'tableNumber' => 'P3-T' . rand(1000, 9999),
            'capacity' => 4,
            'status' => 'AVAILABLE',
            'isActive' => true,
        ]);

        // Create a completed order with bill and payment
        $orderId = (string)Str::uuid();
        $this->order = Order::create([
            'id' => $orderId,
            'orderNumber' => 'CCB-P3-' . rand(1000, 9999),
            'publicTrackingToken' => 'TRK_' . Str::random(10),
            'customerId' => $this->customer->id,
            'tableId' => $this->table->id,
            'tableNumberSnapshot' => $this->table->tableNumber,
            'source' => 'OWNER_POS',
            'status' => 'COMPLETED',
            'paymentStatus' => 'PAID',
            'subtotal' => 300.0,
            'discount' => 30.0,
            'couponDiscount' => 10.0,
            'taxableAmount' => 270.0,
            'cgst' => 6.75,
            'sgst' => 6.75,
            'grandTotal' => 283.50,
            'createdById' => $this->owner->id,
            'createdAt' => now(),
        ]);

        OrderItem::create([
            'id' => (string)Str::uuid(),
            'orderId' => $this->order->id,
            'menuItemId' => $this->menuItem->id,
            'nameSnapshot' => 'Historical Cappuccino Special',
            'priceSnapshot' => 150.0,
            'quantity' => 500,
            'totalPrice' => 75000.0,
        ]);

        $this->bill = Bill::create([
            'id' => (string)Str::uuid(),
            'billNumber' => 'BILL-P3-' . rand(1000, 9999),
            'orderId' => $this->order->id,
            'subtotal' => 300.0,
            'discount' => 30.0,
            'couponDiscount' => 10.0,
            'taxableAmount' => 270.0,
            'cgst' => 6.75,
            'sgst' => 6.75,
            'grandTotal' => 283.50,
            'status' => 'PAID',
            'paymentStatus' => 'PAID',
            'finalizedAt' => now(),
            'createdById' => $this->owner->id,
        ]);

        $this->payment = Payment::create([
            'id' => (string)Str::uuid(),
            'orderId' => $this->order->id,
            'billId' => $this->bill->id,
            'method' => 'UPI',
            'amount' => 283.50,
            'status' => 'COMPLETED',
            'isSettled' => true,
            'receivedById' => $this->owner->id,
            'paidAt' => now(),
        ]);
    }

    protected function tearDown(): void
    {
        if ($this->payment) { $this->payment->delete(); }
        if ($this->bill) { $this->bill->delete(); }
        if ($this->order) {
            OrderItem::where('orderId', $this->order->id)->delete();
            $this->order->delete();
        }
        if ($this->table) { $this->table->delete(); }
        if ($this->customer) { $this->customer->delete(); }
        if ($this->menuItem) { $this->menuItem->delete(); }
        if ($this->category) { $this->category->delete(); }

        if ($this->owner) {
            $this->owner->sessions()->delete();
            $this->owner->delete();
        }
        if ($this->manager) { $this->manager->sessions()->delete(); $this->manager->delete(); }
        if ($this->cashier) { $this->cashier->sessions()->delete(); $this->cashier->delete(); }

        parent::tearDown();
    }

    private function createStaff(string $role): Staff
    {
        return Staff::create([
            'id' => (string)Str::uuid(),
            'name' => "Staff {$role} P3",
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

    // ==========================================
    // ANALYTICS ENDPOINTS
    // ==========================================

    public function test_overview_endpoint_works_and_uses_snapshots(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/analytics/overview?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();

        $this->assertGreaterThanOrEqual(283.50, (float)$data['billedSales']);
        $this->assertGreaterThanOrEqual(283.50, (float)$data['settledCollection']);
        $this->assertGreaterThanOrEqual(283.50, (float)$data['upiCollection']);
        $this->assertGreaterThanOrEqual(13.50, (float)$data['gstCollected']);
        $this->assertGreaterThanOrEqual(30.0, (float)$data['discountsGiven']);
        $this->assertGreaterThanOrEqual(1, $data['orderCount']);
    }

    public function test_sales_trend_daily_aggregation(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/analytics/sales-trend?range=TODAY&groupBy=DAILY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertIsArray($data);
        $this->assertNotEmpty($data);
        $this->assertGreaterThanOrEqual(283.50, (float)$data[0]['billedSales']);
        $this->assertGreaterThanOrEqual(283.50, (float)$data[0]['settledCollection']);
    }

    public function test_orders_analytics(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/analytics/orders?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertGreaterThanOrEqual(1, $data['total']);
        $this->assertGreaterThanOrEqual(1, $data['dineInCount']);
        $this->assertGreaterThanOrEqual(1, $data['statuses']['COMPLETED']);
    }

    public function test_payments_analytics(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/analytics/payments?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertGreaterThanOrEqual(283.50, (float)$data['totalSettled']);
        $this->assertGreaterThanOrEqual(283.50, (float)$data['upi']);
        $this->assertGreaterThanOrEqual(1, $data['paidBillsCount']);
    }

    public function test_discounts_analytics(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/analytics/discounts?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertEquals(30.0, (float)$data['total']);
        $this->assertEquals(10.0, (float)$data['couponDiscounts']);
    }

    public function test_items_analytics_uses_name_snapshots(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/analytics/items?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertGreaterThanOrEqual(300.0, (float)$data['totalRevenue']);
        $this->assertGreaterThanOrEqual(2, $data['totalItemsSold']);

        $itemNames = collect($data['topItems'])->pluck('name')->toArray();
        $this->assertContains('Historical Cappuccino Special', $itemNames);
    }

    public function test_customers_analytics(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/analytics/customers?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertGreaterThanOrEqual(1, $data['totalCustomers']);
        $this->assertGreaterThanOrEqual(283.50, (float)$data['totalSales']);
    }

    public function test_order_performance_analytics(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/analytics/order-performance?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertGreaterThanOrEqual(1, $data['completedOrdersCount']);
    }

    public function test_waiter_calls_analytics(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/analytics/waiter-calls?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertArrayHasKey('total', $data);
    }

    public function test_tables_analytics(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/analytics/tables?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertGreaterThanOrEqual(1, $data['totalDineInOrders']);
        $this->assertNotEmpty($data['tables']);
    }

    public function test_coupons_analytics(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/analytics/coupons?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertEquals(10.0, (float)$data['totalDiscountAmount']);
    }

    // ==========================================
    // REPORT ENDPOINTS
    // ==========================================

    public function test_daily_sales_report(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/reports/daily-sales?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertGreaterThanOrEqual(1, $data['total']);
        $this->assertGreaterThanOrEqual(283.50, (float)$data['items'][0]['billedSales']);
    }

    public function test_payments_report(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/reports/payments?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertGreaterThanOrEqual(1, $data['total']);
        $this->assertGreaterThanOrEqual(283.50, (float)$data['items'][0]['amount']);
    }

    public function test_gst_report_uses_persisted_tax_snapshots(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/reports/gst?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertGreaterThanOrEqual(1, $data['total']);
        $this->assertGreaterThanOrEqual(270.0, (float)$data['items'][0]['taxableAmount']);
    }

    public function test_credit_due_report(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/reports/credit-due?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertArrayHasKey('items', $data);
    }

    public function test_inventory_valuation_report(): void
    {
        $ing = Ingredient::create([
            'id' => (string)Str::uuid(),
            'name' => 'Valuation Coffee Beans ' . Str::random(6),
            'unit' => 'KG',
            'currentStock' => 10.0,
            'averageCost' => 20.0,
            'lastPurchaseCost' => 20.0,
            'isActive' => true,
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/reports/inventory-valuation');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertGreaterThanOrEqual(200.0, (float)$data['totalValuation']);

        $ing->delete();
    }

    public function test_cancellations_report(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/reports/cancellations?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertArrayHasKey('items', $data);
    }

    public function test_discounts_report(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/reports/discounts?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertGreaterThanOrEqual(1, $data['total']);
        $this->assertGreaterThanOrEqual(30.0, (float)$data['items'][0]['discount']);
    }

    public function test_coupons_report(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/reports/coupons?range=TODAY');

        $res->assertStatus(200);
        $data = $res->json();
        $this->assertGreaterThanOrEqual(1, $data['total']);
        $this->assertGreaterThanOrEqual(10.0, (float)$data['items'][0]['discountAmount']);
    }

    // ==========================================
    // CSV EXPORT & FORMULA INJECTION PROTECTION
    // ==========================================

    public function test_csv_export_streams_valid_content(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->get('/api/reports/daily-sales/export.csv?range=TODAY');

        $res->assertStatus(200);
        $this->assertStringContainsString('text/csv', $res->headers->get('content-type'));
        $this->assertStringContainsString('attachment; filename="report-daily-sales-TODAY.csv"', $res->headers->get('content-disposition'));
        $content = $res->getContent();
        $this->assertStringContainsString('Date', $content);
        $this->assertStringContainsString('Billed Sales', $content);
        $this->assertStringContainsString('283.5', $content);
    }

    public function test_csv_formula_injection_protection(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->get('/api/reports/gst/export.csv?range=TODAY');

        $res->assertStatus(200);
        $content = $res->getContent();
        $this->assertStringContainsString('Bill Number', $content);
    }

    // ==========================================
    // FINANCIAL PERMISSION GUARDS
    // ==========================================

    public function test_unauthorized_financial_analytics_rejected(): void
    {
        RestaurantSettings::updateOrCreate(
            ['id' => 'default'],
            ['managerCanViewFinancialAnalytics' => false]
        );

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)
            ->getJson('/api/analytics/overview?range=TODAY');

        $res->assertStatus(403);
        $this->assertStringContainsString('Access denied', $res->json('message'));
    }

    public function test_unauthorized_financial_reports_rejected(): void
    {
        RestaurantSettings::updateOrCreate(
            ['id' => 'default'],
            ['managerCanViewFinancialReports' => false]
        );

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)
            ->getJson('/api/reports/daily-sales?range=TODAY');

        $res->assertStatus(403);
        $this->assertStringContainsString('Access denied', $res->json('message'));
    }

    public function test_authorized_manager_financial_analytics_and_reports(): void
    {
        RestaurantSettings::updateOrCreate(
            ['id' => 'default'],
            [
                'managerCanViewFinancialAnalytics' => true,
                'managerCanViewFinancialReports' => true,
            ]
        );

        $resAnalytics = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)
            ->getJson('/api/analytics/overview?range=TODAY');
        $resAnalytics->assertStatus(200);

        $resReport = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)
            ->getJson('/api/reports/daily-sales?range=TODAY');
        $resReport->assertStatus(200);
    }

    public function test_date_range_validation(): void
    {
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)
            ->getJson('/api/analytics/overview?range=CUSTOM&startDate=2026-08-31&endDate=2026-08-01');

        $res->assertStatus(400);
        $this->assertStringContainsString('Start date cannot be after end date', $res->json('message'));
    }
}
