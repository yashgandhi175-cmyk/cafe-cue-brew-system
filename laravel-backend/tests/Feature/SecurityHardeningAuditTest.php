<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\Coupon;
use App\Models\Banner;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class SecurityHardeningAuditTest extends TestCase
{
    protected string $ownerId;
    protected string $waiterId;
    protected string $managerId;
    protected string $ownerToken;
    protected string $waiterToken;
    protected string $managerToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->ownerId = (string)Str::uuid();
        $this->waiterId = (string)Str::uuid();
        $this->managerId = (string)Str::uuid();

        Staff::create([
            'id' => $this->ownerId,
            'name' => 'Security Audit Owner',
            'phone' => '9999988888',
            'role' => 'OWNER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
        ]);

        Staff::create([
            'id' => $this->waiterId,
            'name' => 'Security Audit Waiter',
            'phone' => '9999977777',
            'role' => 'WAITER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
        ]);

        Staff::create([
            'id' => $this->managerId,
            'name' => 'Security Audit Manager',
            'phone' => '9999966666',
            'role' => 'MANAGER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
        ]);

        $ownerSid = (string)Str::uuid();
        $waiterSid = (string)Str::uuid();
        $managerSid = (string)Str::uuid();

        \App\Models\StaffSession::create([
            'id' => $ownerSid,
            'staffId' => $this->ownerId,
            'token' => hash('sha256', JwtHelper::generateToken(['sub' => $this->ownerId, 'role' => 'OWNER', 'sid' => $ownerSid], env('JWT_SECRET', 'test-jwt-secret'))),
            'expiredAt' => now()->addHours(12),
            'isActive' => true,
        ]);

        \App\Models\StaffSession::create([
            'id' => $waiterSid,
            'staffId' => $this->waiterId,
            'token' => hash('sha256', JwtHelper::generateToken(['sub' => $this->waiterId, 'role' => 'WAITER', 'sid' => $waiterSid], env('JWT_SECRET', 'test-jwt-secret'))),
            'expiredAt' => now()->addHours(12),
            'isActive' => true,
        ]);

        \App\Models\StaffSession::create([
            'id' => $managerSid,
            'staffId' => $this->managerId,
            'token' => hash('sha256', JwtHelper::generateToken(['sub' => $this->managerId, 'role' => 'MANAGER', 'sid' => $managerSid], env('JWT_SECRET', 'test-jwt-secret'))),
            'expiredAt' => now()->addHours(12),
            'isActive' => true,
        ]);

        $this->ownerToken = JwtHelper::generateToken(['sub' => $this->ownerId, 'role' => 'OWNER', 'sid' => $ownerSid], env('JWT_SECRET', 'test-jwt-secret'));
        $this->waiterToken = JwtHelper::generateToken(['sub' => $this->waiterId, 'role' => 'WAITER', 'sid' => $waiterSid], env('JWT_SECRET', 'test-jwt-secret'));
        $this->managerToken = JwtHelper::generateToken(['sub' => $this->managerId, 'role' => 'MANAGER', 'sid' => $managerSid], env('JWT_SECRET', 'test-jwt-secret'));
    }

    protected function tearDown(): void
    {
        Staff::whereIn('id', [$this->ownerId, $this->waiterId, $this->managerId])->delete();
        Coupon::where('code', 'like', 'AUDIT_%')->orWhere('code', 'AUDITTEST10')->delete();
        parent::tearDown();
    }

    public function test_public_staff_endpoint_returns_sanitized_active_staff(): void
    {
        $response = $this->getJson('/api/staff/public');
        $response->assertStatus(200);
        $response->assertJsonStructure([
            '*' => ['id', 'name', 'role']
        ]);
        $response->assertJsonMissing(['pinHash', 'phone']);
    }

    public function test_waiter_cannot_escalate_role_or_update_staff_pin(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->waiterToken}"])
            ->putJson("/api/staff/{$this->waiterId}/pin", [
                'role' => 'OWNER',
                'newPin' => '9999'
            ]);

        $response->assertStatus(403);
    }

    public function test_owner_can_update_staff_pin(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->ownerToken}"])
            ->putJson("/api/staff/{$this->waiterId}/pin", [
                'newPin' => '5678'
            ]);

        $response->assertStatus(200);
        $response->assertJson(['message' => 'Staff PIN updated successfully']);

        $updatedStaff = Staff::find($this->waiterId);
        $this->assertTrue(Hash::check('5678', $updatedStaff->pinHash));
        $this->assertEquals('WAITER', $updatedStaff->role);
    }

    public function test_owner_cannot_set_non_numeric_staff_pin(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->ownerToken}"])
            ->putJson("/api/staff/{$this->waiterId}/pin", [
                'newPin' => '12ab'
            ]);

        $response->assertStatus(400);
        $response->assertJson([
            'message' => 'PIN must contain only digits.',
            'statusCode' => 400,
        ]);
    }

    public function test_owner_cannot_set_staff_pin_with_wrong_configured_length(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->ownerToken}"])
            ->putJson("/api/staff/{$this->waiterId}/pin", [
                'newPin' => '12345'
            ]);

        $response->assertStatus(400);
        $response->assertJson([
            'message' => 'PIN must be exactly 4 digits according to policy.',
            'statusCode' => 400,
        ]);
    }

    public function test_owner_cannot_create_staff_with_non_numeric_pin(): void
    {
        $phone = '99999' . random_int(10000, 99999);

        $response = $this->withHeaders(['Authorization' => "Bearer {$this->ownerToken}"])
            ->postJson('/api/staff', [
                'name' => 'Invalid PIN Staff',
                'phone' => $phone,
                'role' => 'WAITER',
                'pin' => '12ab',
            ]);

        $response->assertStatus(400);
        $response->assertJson([
            'message' => 'PIN must contain only digits.',
            'statusCode' => 400,
        ]);
    }


    public function test_manager_cannot_access_staff_administration(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->managerToken}"])
            ->getJson('/api/staff');

        $response->assertStatus(403);
    }

    public function test_manager_cannot_create_owner_staff_account(): void
    {
        $phone = '99999' . random_int(10000, 99999);

        $response = $this->withHeaders(['Authorization' => "Bearer {$this->managerToken}"])
            ->postJson('/api/staff', [
                'name' => 'Unauthorized Owner',
                'phone' => $phone,
                'role' => 'OWNER',
                'pin' => '1234',
            ]);

        $response->assertStatus(403);
        $this->assertNull(Staff::where('phone', $phone)->first());
    }

    public function test_manager_cannot_promote_staff_to_owner(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->managerToken}"])
            ->putJson("/api/staff/{$this->waiterId}", [
                'role' => 'OWNER',
            ]);

        $response->assertStatus(403);
        $this->assertEquals('WAITER', Staff::find($this->waiterId)->role);
    }

    public function test_manager_cannot_deactivate_owner(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->managerToken}"])
            ->deleteJson("/api/staff/{$this->ownerId}");

        $response->assertStatus(403);
        $this->assertEquals('ACTIVE', Staff::find($this->ownerId)->status);
    }

    public function test_manager_cannot_change_owner_pin(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->managerToken}"])
            ->putJson("/api/staff/{$this->ownerId}/pin", [
                'newPin' => '5678',
            ]);

        $response->assertStatus(403);
        $this->assertTrue(Hash::check('1234', Staff::find($this->ownerId)->pinHash));
    }

    public function test_manager_cannot_revoke_all_staff_sessions(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->managerToken}"])
            ->postJson('/api/staff/sessions/revoke-all');

        $response->assertStatus(403);
    }


    public function test_manager_cannot_update_restaurant_settings(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->managerToken}"])
            ->putJson('/api/settings', [
                'name' => 'Unauthorized Manager Update',
            ]);

        $response->assertStatus(403);
    }

    public function test_waiter_cannot_update_restaurant_settings(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->waiterToken}"])
            ->putJson('/api/settings', [
                'name' => 'Unauthorized Waiter Update',
            ]);

        $response->assertStatus(403);
    }

    public function test_settings_update_cannot_modify_hidden_security_fields(): void
    {
        \App\Models\RestaurantSettings::where('id', 'attacker-controlled-id')->delete();

        $settings = \App\Models\RestaurantSettings::find('default');

        if (!$settings) {
            $settings = \App\Models\RestaurantSettings::create([
                'id' => 'default',
                'name' => 'Cafe Cue & Brew',
            ]);
        }

        $originalSessionTimeout = $settings->sessionTimeout;
        $originalMaxFailedAttempts = $settings->maxFailedAttempts;
        $originalAllowNegativeStock = $settings->allowNegativeStock;

        $response = $this->withHeaders(['Authorization' => "Bearer {$this->ownerToken}"])
            ->putJson('/api/settings', [
                'name' => 'Allowed Settings Update',
                'sessionTimeout' => 999999,
                'maxFailedAttempts' => 999999,
                'allowNegativeStock' => true,
                'managerCanManageInventory' => false,
                'id' => 'attacker-controlled-id',
            ]);

        $response->assertStatus(200);

        $settings->refresh();

        $this->assertSame('Allowed Settings Update', $settings->name);
        $this->assertSame($originalSessionTimeout, $settings->sessionTimeout);
        $this->assertSame($originalMaxFailedAttempts, $settings->maxFailedAttempts);
        $this->assertSame($originalAllowNegativeStock, $settings->allowNegativeStock);
        $this->assertSame('default', $settings->id);

        $this->assertDatabaseMissing('RestaurantSettings', [
            'id' => 'attacker-controlled-id',
        ]);
    }

    public function test_settings_update_cannot_change_singleton_id(): void
    {
        \App\Models\RestaurantSettings::where('id', 'attacker-controlled-id')->delete();

        $response = $this->withHeaders(['Authorization' => "Bearer {$this->ownerToken}"])
            ->putJson('/api/settings', [
                'id' => 'attacker-controlled-id',
                'name' => 'Security Audit Settings',
            ]);

        $response->assertStatus(200);

        $this->assertDatabaseHas('RestaurantSettings', [
            'id' => 'default',
            'name' => 'Security Audit Settings',
        ]);

        $this->assertDatabaseMissing('RestaurantSettings', [
            'id' => 'attacker-controlled-id',
        ]);
    }

    public function test_coupon_and_banner_status_toggle(): void
    {
        Coupon::where('code', 'like', 'AUDIT_%')->orWhere('code', 'AUDITTEST10')->delete();
        $couponId = (string)Str::uuid();
        $couponCode = 'AUDIT_' . strtoupper(Str::random(6));

        Coupon::create([
            'id' => $couponId,
            'name' => 'Audit Coupon',
            'code' => $couponCode,
            'type' => 'PERCENTAGE',
            'value' => 10,
            'minOrder' => 0,
            'maxDiscount' => 100,
            'startDate' => now(),
            'endDate' => now()->addDays(30),
            'isActive' => true,
        ]);

        $response = $this->withHeaders(['Authorization' => "Bearer {$this->ownerToken}"])
            ->patchJson("/api/coupons/{$couponId}/status", ['isActive' => false]);

        $response->assertStatus(200);
        $this->assertFalse((bool)Coupon::find($couponId)->isActive);

        Coupon::where('id', $couponId)->delete();
    }

    public function test_waiter_cannot_access_marketing_analytics_overview(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->waiterToken}"])
            ->getJson('/api/marketing/analytics/overview');

        $response->assertStatus(403);
    }
}
