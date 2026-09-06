<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\RestaurantTable;
use App\Models\Order;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class TableOperationsSecurityTest extends TestCase
{
    protected $staff;
    protected $token;

    protected function setUp(): void
    {
        parent::setUp();

        $staffId = (string) Str::uuid();

        $this->staff = Staff::create([
            'id' => $staffId,
            'name' => 'Table Security Tester',
            'phone' => '+919' . rand(100000000, 999999999),
            'role' => 'MANAGER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
        ]);

        $sid = (string) Str::uuid();

        $this->token = JwtHelper::generateToken(
            [
                'sub' => $staffId,
                'role' => 'MANAGER',
                'sid' => $sid,
            ],
            env('JWT_SECRET', 'dev-secret-key')
        );

        StaffSession::create([
            'id' => $sid,
            'staffId' => $staffId,
            'token' => hash('sha256', $this->token),
            'expiredAt' => date('Y-m-d H:i:s', time() + 43200),
            'isActive' => true,
            'createdAt' => date('Y-m-d H:i:s'),
        ]);
    }

    protected function tearDown(): void
    {
        if ($this->staff) {
            $this->staff->sessions()->delete();
            $this->staff->delete();
        }

        parent::tearDown();
    }

    private function createTable(string $status = 'AVAILABLE', bool $isActive = true): RestaurantTable
    {
        return RestaurantTable::create([
            'id' => (string) Str::uuid(),
            'tableNumber' => 'SEC-T' . rand(10000, 99999) . '-' . Str::random(4),
            'capacity' => 4,
            'status' => $status,
            'isActive' => $isActive,
        ]);
    }

    private function createActiveOrder(string $tableId): Order
    {
        return Order::create([
            'id' => (string) Str::uuid(),
            'orderNumber' => 'SEC-' . rand(100000, 999999),
            'publicTrackingToken' => Str::random(32),
            'idempotencyKey' => (string) Str::uuid(),
            'tableId' => $tableId,
            'tableNumberSnapshot' => 'SECURITY',
            'source' => 'OWNER_POS',
            'status' => 'ACCEPTED',
            'paymentStatus' => 'UNPAID',
            'subtotal' => 100,
            'discount' => 0,
            'couponDiscount' => 0,
            'taxableAmount' => 100,
            'cgst' => 2.50,
            'sgst' => 2.50,
            'serviceCharge' => 0,
            'nightCharge' => 0,
            'roundOff' => 0,
            'grandTotal' => 105,
            'inventoryDeducted' => false,
        ]);
    }

    public function test_shift_moves_active_orders_and_updates_table_statuses(): void
    {
        $source = $this->createTable('OCCUPIED');
        $target = $this->createTable('AVAILABLE');

        $order = $this->createActiveOrder($source->id);

        $response = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->token
        )->postJson('/api/tables/shift', [
            'sourceTableId' => $source->id,
            'targetTableId' => $target->id,
        ]);

        $response->assertStatus(200);

        $this->assertDatabaseHas('Order', [
            'id' => $order->id,
            'tableId' => $target->id,
        ]);

        $this->assertDatabaseHas('RestaurantTable', [
            'id' => $source->id,
            'status' => 'AVAILABLE',
        ]);

        $this->assertDatabaseHas('RestaurantTable', [
            'id' => $target->id,
            'status' => 'OCCUPIED',
        ]);
    }

    public function test_shift_rejects_same_source_and_target_table(): void
    {
        $table = $this->createTable('OCCUPIED');

        $response = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->token
        )->postJson('/api/tables/shift', [
            'sourceTableId' => $table->id,
            'targetTableId' => $table->id,
        ]);

        $response->assertStatus(422);
    }

    public function test_merge_rejects_primary_table_inside_secondary_tables(): void
    {
        $primary = $this->createTable('OCCUPIED');
        $secondary = $this->createTable('OCCUPIED');

        $response = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->token
        )->postJson('/api/tables/merge', [
            'primaryTableId' => $primary->id,
            'secondaryTableIds' => [$primary->id, $secondary->id],
        ]);

        $response->assertStatus(422);
    }

    public function test_shift_rejects_inactive_source_table(): void
    {
        $source = $this->createTable('OCCUPIED', false);
        $target = $this->createTable('AVAILABLE', true);

        $response = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->token
        )->postJson('/api/tables/shift', [
            'sourceTableId' => $source->id,
            'targetTableId' => $target->id,
        ]);

        $response->assertStatus(422);
    }

    public function test_merge_rejects_inactive_secondary_table(): void
    {
        $primary = $this->createTable('OCCUPIED', true);
        $secondary = $this->createTable('OCCUPIED', false);

        $response = $this->withHeader(
            'Authorization',
            'Bearer ' . $this->token
        )->postJson('/api/tables/merge', [
            'primaryTableId' => $primary->id,
            'secondaryTableIds' => [$secondary->id],
        ]);

        $response->assertStatus(422);
    }
}
