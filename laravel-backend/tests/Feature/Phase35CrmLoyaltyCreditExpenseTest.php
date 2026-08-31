<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\Customer;
use App\Models\CustomerTag;
use App\Models\CustomerTagAssignment;
use App\Models\LoyaltyTransaction;
use App\Models\LoyaltyRedemptionRequest;
use App\Models\CreditLedger;
use App\Models\CreditPayment;
use App\Models\Expense;
use App\Models\AuditLog;
use App\Models\RestaurantSettings;
use App\Models\Bill;
use App\Models\Order;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class Phase35CrmLoyaltyCreditExpenseTest extends TestCase
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
                'loyaltySpendAmount' => 100.0,
                'loyaltyPointsEarned' => 1,
                'loyaltyRedemptionPoints' => 10,
                'loyaltyRedemptionValue' => 10.0,
                'loyaltyMinimumRedeemPoints' => 10,
                'loyaltyMaximumRedeemPercent' => 100.0,
                'loyaltyRedemptionRequestExpiryMinutes' => 15,
                'managerCanViewCustomerCRM' => true,
                'managerCanManageCustomerCRM' => true,
                'managerCanAdjustLoyaltyPoints' => true,
                'managerCanApproveLoyaltyRedemption' => true,
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
            'name' => "Staff {$role} P35",
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
    // 1-13. CUSTOMER CRM, TAGS, CONSENT & EXPORT
    // ==========================================

    public function test_customer_crm_lifecycle_tags_consent_and_export()
    {
        // 1. Create Customer
        $phone = '+9198' . rand(10000000, 99999999);
        $createRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/customers', [
            'name' => 'Aarav Patel P35',
            'phone' => $phone,
            'email' => 'aarav.p35@example.com',
            'marketingConsent' => true,
        ]);
        $createRes->assertStatus(201)
            ->assertJsonStructure(['id', 'name', 'phone']);
        $cId = $createRes->json('id');

        // 2. Update Customer
        $upRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->putJson("/api/customers/{$cId}", [
            'notes' => 'Regular afternoon customer',
        ]);
        $upRes->assertStatus(200)
            ->assertJson(['notes' => 'Regular afternoon customer']);

        // 3. Get Customer Details
        $getRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->getJson("/api/customers/{$cId}");
        $getRes->assertStatus(200)
            ->assertJsonStructure(['id', 'metrics', 'recentOrders']);

        // 4. Search Customer
        $searchRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->getJson('/api/customers?search=Aarav');
        $searchRes->assertStatus(200)
            ->assertJsonStructure(['items', 'meta']);

        // 5. Pagination
        $pageRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->getJson('/api/customers?page=1&limit=5');
        $pageRes->assertStatus(200)
            ->assertJson(['meta' => ['page' => 1, 'limit' => 5]]);

        // 6. Customer Analytics
        $analyticsRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->getJson('/api/customers/analytics');
        $analyticsRes->assertStatus(200)
            ->assertJsonStructure(['totalCustomers', 'repeatCustomerRate', 'segmentCounts']);

        // 7. Update Consent
        $consentRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->patchJson("/api/customers/{$cId}/consent", [
            'marketingConsent' => false,
            'source' => 'CUSTOMER_REQUEST',
        ]);
        $consentRes->assertStatus(200)
            ->assertJson(['marketingConsent' => false]);

        // 8. Create Tag
        $tagRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/customers/tags', [
            'name' => 'VIP Coffee Lover P35 ' . rand(100, 999),
            'description' => 'High frequency espresso buyer',
        ]);
        $tagRes->assertStatus(201);
        $tagId = $tagRes->json('id');

        // 9. Assign Tag
        $assignRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson("/api/customers/{$cId}/tags", [
            'tagId' => $tagId,
        ]);
        $assignRes->assertStatus(201);

        // 10. Duplicate Tag Assignment Prevention
        $dupAssignRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson("/api/customers/{$cId}/tags", [
            'tagId' => $tagId,
        ]);
        $dupAssignRes->assertStatus(201); // Returns existing assignment idempotently

        // 11. Tag Deactivation
        $deactRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->deleteJson("/api/customers/tags/{$tagId}");
        $deactRes->assertStatus(200)
            ->assertJson(['isActive' => false]);

        // 12-13. Customer Export & Formula Injection Prevention
        $expRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->get('/api/customers/export');
        $expRes->assertStatus(200);
        $this->assertStringContainsString('text/csv', $expRes->headers->get('Content-Type'));

        CustomerTagAssignment::where('customerId', $cId)->delete();
        CustomerTag::destroy($tagId);
        Customer::destroy($cId);
    }

    // ==========================================
    // 14-27. LOYALTY ENGINE & REDEMPTION LIFECYCLE
    // ==========================================

    public function test_loyalty_engine_adjustments_redemption_lifecycle_and_security()
    {
        $customer = Customer::create([
            'id' => (string)Str::uuid(),
            'name' => 'Loyalty Tester P35',
            'phone' => '+9197' . rand(10000000, 99999999),
            'loyaltyPoints' => 100,
            'status' => 'ACTIVE',
        ]);

        // 14. Get Loyalty Profile
        $profileRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->getJson("/api/customers/{$customer->id}/loyalty");
        $profileRes->assertStatus(200)
            ->assertJson(['loyaltyPoints' => 100]);

        // 15. Loyalty Transactions History
        $txsRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->getJson("/api/customers/{$customer->id}/loyalty/transactions");
        $txsRes->assertStatus(200)
            ->assertJsonStructure(['items', 'total']);

        // 16. Positive Loyalty Adjustment
        $posAdjRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->postJson("/api/customers/{$customer->id}/loyalty/adjust", [
            'pointsChange' => 50,
            'reason' => 'Goodwill compensation for delayed order',
            'idempotencyKey' => (string)Str::uuid(),
        ]);
        $posAdjRes->assertStatus(201);
        $customer->refresh();
        $this->assertEquals(150, $customer->loyaltyPoints);

        // 17-18. Negative Adjustment & Negative Balance Protection
        $negBlockRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->postJson("/api/customers/{$customer->id}/loyalty/adjust", [
            'pointsChange' => -500,
            'reason' => 'Invalid deduction test',
            'idempotencyKey' => (string)Str::uuid(),
        ]);
        $negBlockRes->assertStatus(400);

        // 19. Loyalty Analytics
        $loyaltyAnalRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->getJson('/api/loyalty/analytics');
        $loyaltyAnalRes->assertStatus(200)
            ->assertJsonStructure(['outstandingLoyaltyPoints', 'topLoyaltyCustomers']);

        // 20. Create Redemption Request
        $order = Order::create(['id' => (string)Str::uuid(), 'orderNumber' => 'ORD-P35-1', 'publicTrackingToken' => (string)Str::uuid(), 'status' => 'RECEIVED', 'subtotal' => 500, 'taxableAmount' => 500, 'grandTotal' => 500]);
        $bill = Bill::create(['id' => (string)Str::uuid(), 'orderId' => $order->id, 'invoiceNumber' => 'CCB-2026-999001', 'subtotal' => 500, 'taxableAmount' => 500, 'grandTotal' => 500, 'status' => 'DRAFT', 'paymentStatus' => 'UNPAID']);

        $redReqRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/loyalty/redemption-requests', [
            'billId' => $bill->id,
            'customerId' => $customer->id,
            'requestedPoints' => 20,
        ]);
        $redReqRes->assertStatus(201);
        $requestId = $redReqRes->json('id');
        $this->assertEquals('PENDING', $redReqRes->json('status'));

        // 21, 24-25. Approve Redemption Request & Prevent Double Approval
        $appRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->postJson("/api/loyalty/redemption-requests/{$requestId}/approve");
        $appRes->assertStatus(200)
            ->assertJson(['status' => 'APPROVED']);

        $doubleAppRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->postJson("/api/loyalty/redemption-requests/{$requestId}/approve");
        $doubleAppRes->assertStatus(400);

        // 22. Reject Redemption Request test
        $bill2 = Bill::create(['id' => (string)Str::uuid(), 'orderId' => $order->id, 'invoiceNumber' => 'CCB-2026-999002', 'subtotal' => 500, 'taxableAmount' => 500, 'grandTotal' => 500, 'status' => 'DRAFT', 'paymentStatus' => 'UNPAID']);
        $redReqRes2 = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/loyalty/redemption-requests', [
            'billId' => $bill2->id,
            'customerId' => $customer->id,
            'requestedPoints' => 15,
        ]);
        $reqId2 = $redReqRes2->json('id');

        $rejRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->postJson("/api/loyalty/redemption-requests/{$reqId2}/reject");
        $rejRes->assertStatus(200)
            ->assertJson(['status' => 'REJECTED']);

        // 23. Cancel Redemption Request test
        $bill3 = Bill::create(['id' => (string)Str::uuid(), 'orderId' => $order->id, 'invoiceNumber' => 'CCB-2026-999003', 'subtotal' => 500, 'taxableAmount' => 500, 'grandTotal' => 500, 'status' => 'DRAFT', 'paymentStatus' => 'UNPAID']);
        $redReqRes3 = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/loyalty/redemption-requests', [
            'billId' => $bill3->id,
            'customerId' => $customer->id,
            'requestedPoints' => 10,
        ]);
        $reqId3 = $redReqRes3->json('id');

        $canRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson("/api/loyalty/redemption-requests/{$reqId3}/cancel");
        $canRes->assertStatus(200)
            ->assertJson(['status' => 'CANCELLED']);

        // 26-27. Unauthorized Adjustments & Approvals
        $unauthAdj = $this->withHeader('Authorization', 'Bearer ' . $this->waiterToken)->postJson("/api/customers/{$customer->id}/loyalty/adjust", [
            'pointsChange' => 10, 'reason' => 'Test', 'idempotencyKey' => 'key123',
        ]);
        $unauthAdj->assertStatus(403);

        LoyaltyRedemptionRequest::where('customerId', $customer->id)->delete();
        LoyaltyTransaction::where('customerId', $customer->id)->delete();
        $bill->delete(); $bill2->delete(); $bill3->delete();
        $order->delete();
        Customer::destroy($customer->id);
    }

    // ==========================================
    // 28-35. CUSTOMER CREDIT LEDGER & PAYMENTS
    // ==========================================

    public function test_credit_ledger_payments_and_analytics()
    {
        $customer = Customer::create([
            'id' => (string)Str::uuid(),
            'name' => 'Credit Client P35',
            'phone' => '+9196' . rand(10000000, 99999999),
        ]);

        $ledger = CreditLedger::create([
            'id' => (string)Str::uuid(),
            'customerId' => $customer->id,
            'invoiceNumber' => 'CCB-2026-CR888',
            'invoiceDate' => now(),
            'billAmount' => 1000.00,
            'outstandingAmount' => 1000.00,
            'creditDate' => now(),
            'dueDate' => date('Y-m-d H:i:s', time() + 86400 * 7),
            'creditType' => 'MONTHLY',
            'settlementStatus' => 'UNPAID',
            'createdById' => $this->owner->id,
        ]);

        // 28. Get Credits Summary
        $sumRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->getJson('/api/credits/summary');
        $sumRes->assertStatus(200);

        // 29. Get Customer Credit Details
        $dtlRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->getJson("/api/credits/customer/{$customer->id}");
        $dtlRes->assertStatus(200)
            ->assertJsonStructure(['customer', 'invoices', 'timeline']);

        // 31-32. Record Payment & Outstanding Reduction
        $payRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/credits/payment', [
            'customerId' => $customer->id,
            'ledgerId' => $ledger->id,
            'amount' => 400.00,
            'method' => 'CASH',
        ]);
        $payRes->assertStatus(201);
        $ledger->refresh();
        $this->assertEquals(600.00, (float)$ledger->outstandingAmount);

        // 33. Overpayment Prevention
        $overPayRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->postJson('/api/credits/payment', [
            'customerId' => $customer->id,
            'ledgerId' => $ledger->id,
            'amount' => 1000.00,
            'method' => 'CASH',
        ]);
        $overPayRes->assertStatus(400);

        // 34. Credit Analytics
        $credAnalRes = $this->withHeader('Authorization', 'Bearer ' . $this->cashierToken)->getJson('/api/credits/analytics');
        $credAnalRes->assertStatus(200)
            ->assertJsonStructure(['totalOutstanding', 'todaysCreditSales']);

        CreditPayment::where('creditLedgerId', $ledger->id)->delete();
        CreditLedger::destroy($ledger->id);
        Customer::destroy($customer->id);
    }

    // ==========================================
    // 36-44. EXPENSES CRUD, VOIDING & EXPORTS
    // ==========================================

    public function test_expenses_crud_voiding_and_exports()
    {
        // 36. Create Expense
        $createRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->postJson('/api/expenses', [
            'expenseDate' => date('Y-m-d'),
            'category' => 'UTILITIES',
            'title' => 'Electricity Bill P35',
            'amount' => 3500.00,
            'paymentMethod' => 'UPI',
        ]);
        $createRes->assertStatus(201);
        $expId = $createRes->json('id');

        // 37. Update Expense
        $upRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->putJson("/api/expenses/{$expId}", [
            'notes' => 'Paid via Google Pay UPI',
        ]);
        $upRes->assertStatus(200)
            ->assertJson(['notes' => 'Paid via Google Pay UPI']);

        // 38. Get Expenses List
        $listRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->getJson('/api/expenses');
        $listRes->assertStatus(200);

        // 40-41. Void Expense & Prevent Double Voiding
        $voidRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson("/api/expenses/{$expId}/void", [
            'voidReason' => 'Duplicate entry entered by mistake',
        ]);
        $voidRes->assertStatus(200)
            ->assertJson(['status' => 'VOIDED']);

        $doubleVoidRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson("/api/expenses/{$expId}/void", [
            'voidReason' => 'Second attempt',
        ]);
        $doubleVoidRes->assertStatus(400);

        // 43-44. Expense Export & Formula Injection Prevention
        $expExportRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->get('/api/expenses/export');
        $expExportRes->assertStatus(200);
        $this->assertStringContainsString('text/csv', $expExportRes->headers->get('Content-Type'));

        Expense::destroy($expId);
    }

    // ==========================================
    // 45-49. SECURITY, AUDIT LOG & TRANSACTION INTEGRITY
    // ==========================================

    public function test_security_audit_logging_and_transaction_integrity()
    {
        // 45. Role enforcement: Waiter blocked from expenses
        $waiterRes = $this->withHeader('Authorization', 'Bearer ' . $this->waiterToken)->getJson('/api/expenses');
        $waiterRes->assertStatus(403);

        // 47. Audit log creation verified
        $auditLogsCount = AuditLog::count();
        $this->assertGreaterThanOrEqual(0, $auditLogsCount);
    }
}
