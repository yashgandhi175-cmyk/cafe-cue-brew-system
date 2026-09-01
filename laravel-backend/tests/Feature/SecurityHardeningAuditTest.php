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
    protected string $ownerToken;
    protected string $waiterToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->ownerId = (string)Str::uuid();
        $this->waiterId = (string)Str::uuid();

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

        $ownerSid = (string)Str::uuid();
        $waiterSid = (string)Str::uuid();

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

        $this->ownerToken = JwtHelper::generateToken(['sub' => $this->ownerId, 'role' => 'OWNER', 'sid' => $ownerSid], env('JWT_SECRET', 'test-jwt-secret'));
        $this->waiterToken = JwtHelper::generateToken(['sub' => $this->waiterId, 'role' => 'WAITER', 'sid' => $waiterSid], env('JWT_SECRET', 'test-jwt-secret'));
    }

    protected function tearDown(): void
    {
        Staff::whereIn('id', [$this->ownerId, $this->waiterId])->delete();
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
