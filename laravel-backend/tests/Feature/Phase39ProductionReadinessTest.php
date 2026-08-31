<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\RestaurantSettings;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Recipe;
use App\Models\Ingredient;
use App\Models\Order;
use App\Models\Bill;
use App\Models\Payment;
use App\Models\StockTransaction;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Str;

class Phase39ProductionReadinessTest extends TestCase
{
    protected $owner;
    protected $cashier;
    protected $waiter;

    protected $ownerToken;
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
            ]
        );

        $this->owner = $this->createStaff('OWNER');
        $this->cashier = $this->createStaff('CASHIER');
        $this->waiter = $this->createStaff('WAITER');

        $this->ownerToken = $this->createStaffToken($this->owner);
        $this->cashierToken = $this->createStaffToken($this->cashier);
        $this->waiterToken = $this->createStaffToken($this->waiter);
    }

    protected function tearDown(): void
    {
        try { if ($this->owner) { $this->owner->sessions()->delete(); $this->owner->delete(); } } catch (\Exception $e) {}
        try { if ($this->cashier) { $this->cashier->sessions()->delete(); $this->cashier->delete(); } } catch (\Exception $e) {}
        try { if ($this->waiter) { $this->waiter->sessions()->delete(); $this->waiter->delete(); } } catch (\Exception $e) {}

        parent::tearDown();
    }

    private function createStaff(string $role): Staff
    {
        return Staff::create([
            'id' => (string)Str::uuid(),
            'name' => "Staff {$role} P39",
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
    // 1. DATABASE SAFETY & TEST ISOLATION VERIFICATION
    // ==========================================

    public function test_database_safety_and_test_isolation()
    {
        $activeDb = Config::get('database.connections.mysql.database');
        $this->assertEquals('cafe_cue_brew_test', $activeDb, 'PHPUnit automated tests MUST target cafe_cue_brew_test ONLY.');
        $this->assertNotEquals('cafe_cue_brew', $activeDb, 'PHPUnit MUST NEVER connect to production database cafe_cue_brew.');
    }

    // ==========================================
    // 2. HEALTH ENDPOINT & PUBLIC API SANITIZATION
    // ==========================================

    public function test_health_endpoint_and_public_api_sanitization()
    {
        $healthRes = $this->getJson('/api/health');
        $healthRes->assertStatus(200)
            ->assertJson(['status' => 'ok'])
            ->assertJsonStructure(['status', 'system', 'version', 'timestamp']);

        $jsonStr = $healthRes->getContent();
        $this->assertStringNotContainsString('password', $jsonStr);
        $this->assertStringNotContainsString('secret', $jsonStr);
        $this->assertStringNotContainsString('pinHash', $jsonStr);
    }

    // ==========================================
    // 3. AUTHORIZATION & SECURITY SANITIZATION
    // ==========================================

    public function test_authorization_and_sanitized_error_responses()
    {
        // 401 Unauthenticated
        $unauthRes = $this->getJson('/api/staff');
        $unauthRes->assertStatus(401);

        // 403 Forbidden: Waiter accessing Staff List
        $forbRes = $this->withHeader('Authorization', 'Bearer ' . $this->waiterToken)->getJson('/api/staff');
        $forbRes->assertStatus(403);

        // Invalid endpoint returns sanitized 404
        $notFoundRes = $this->getJson('/api/non-existent-endpoint');
        $notFoundRes->assertStatus(404);

        $jsonContent = $notFoundRes->getContent();
        $this->assertStringNotContainsString('SQLSTATE', $jsonContent);
        $this->assertStringNotContainsString('Stack trace', $jsonContent);
    }

    // ==========================================
    // 4. HOSTINGER SCHEDULER COMMAND EXECUTION
    // ==========================================

    public function test_hostinger_scheduler_commands_execution()
    {
        $res1 = Artisan::call('marketing:process-queue', ['--batchSize' => 5]);
        $this->assertEquals(0, $res1);

        $res2 = Artisan::call('marketing:recover-stalled', ['--timeout' => 10]);
        $this->assertEquals(0, $res2);
    }
}
