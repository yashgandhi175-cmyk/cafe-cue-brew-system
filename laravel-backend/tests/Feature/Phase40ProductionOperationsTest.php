<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\RestaurantSettings;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Phase40ProductionOperationsTest extends TestCase
{
    protected $owner;
    protected $waiter;
    protected $ownerToken;
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
            ]
        );

        $this->owner = $this->createStaff('OWNER');
        $this->waiter = $this->createStaff('WAITER');

        $this->ownerToken = $this->createStaffToken($this->owner);
        $this->waiterToken = $this->createStaffToken($this->waiter);
    }

    protected function tearDown(): void
    {
        try { if ($this->owner) { $this->owner->sessions()->delete(); $this->owner->delete(); } } catch (\Exception $e) {}
        try { if ($this->waiter) { $this->waiter->sessions()->delete(); $this->waiter->delete(); } } catch (\Exception $e) {}

        parent::tearDown();
    }

    private function createStaff(string $role): Staff
    {
        return Staff::create([
            'id' => (string)Str::uuid(),
            'name' => "Staff {$role} P40",
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
    // 1. HEALTH LIVENESS & READINESS CHECKS
    // ==========================================

    public function test_liveness_and_readiness_endpoints()
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
    }

    // ==========================================
    // 2. PRODUCTION CONFIG & ERROR SANITIZATION
    // ==========================================

    public function test_production_safety_and_error_sanitization()
    {
        $activeDb = Config::get('database.connections.mysql.database');
        $this->assertEquals('cafe_cue_brew_test', $activeDb);
        $this->assertNotEquals('cafe_cue_brew', $activeDb);

        // Masked 404
        $notFoundRes = $this->getJson('/api/invalid-operational-endpoint');
        $notFoundRes->assertStatus(404);
        $content = $notFoundRes->getContent();
        $this->assertStringNotContainsString('SQLSTATE', $content);
        $this->assertStringNotContainsString('database', $content);
    }

    // ==========================================
    // 3. TRANSACTION ROLLBACK & DATA INTEGRITY
    // ==========================================

    public function test_transaction_rollback_preserves_data_integrity()
    {
        $initialCount = DB::table('Staff')->count();

        try {
            DB::transaction(function () {
                Staff::create([
                    'id' => (string)Str::uuid(),
                    'name' => 'Rollback Test Staff',
                    'phone' => '+919999999999',
                    'role' => 'WAITER',
                    'pinHash' => Hash::make('1234'),
                    'status' => 'ACTIVE',
                ]);
                throw new \Exception('Simulated Failure to trigger rollback');
            });
        } catch (\Exception $e) {
            // Expected
        }

        $afterCount = DB::table('Staff')->count();
        $this->assertEquals($initialCount, $afterCount, 'Transaction rollback MUST NOT persist uncommitted records.');
    }

    // ==========================================
    // 4. SCHEDULER COMMANDS EXECUTION SAFETY
    // ==========================================

    public function test_scheduler_commands_safety_and_resilience()
    {
        $procResult = Artisan::call('marketing:process-queue', ['--batchSize' => 10]);
        $this->assertEquals(0, $procResult);

        $recResult = Artisan::call('marketing:recover-stalled', ['--timeout' => 10]);
        $this->assertEquals(0, $recResult);
    }
}
