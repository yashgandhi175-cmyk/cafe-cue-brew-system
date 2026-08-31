<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\RestaurantSettings;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthenticationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        RestaurantSettings::updateOrCreate(
            ['id' => 'default'],
            [
                'maxFailedAttempts' => 5,
                'accountLockDuration' => 15,
                'pinLength' => 4,
                'sessionTimeout' => 720,
            ]
        );
    }

    private function randomPhone(): string
    {
        return '+919' . rand(100000000, 999999999);
    }

    public function test_successful_login()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Test Owner',
            'phone' => $this->randomPhone(),
            'role' => 'OWNER',
            'pinHash' => Hash::make('1234'),
            'mustChangePin' => false,
            'status' => 'ACTIVE',
            'failedAttempts' => 0,
        ]);

        $response = $this->postJson('/api/auth/login', [
            'staffId' => $staffId,
            'pin' => '1234',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'token',
                'staff' => ['id', 'name', 'phone', 'role', 'mustChangePin']
            ]);

        $this->assertDatabaseHas('StaffSession', [
            'staffId' => $staffId,
            'isActive' => true,
        ]);

        $staff->sessions()->delete();
        $staff->delete();
    }

    public function test_invalid_pin()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Test Staff Invalid PIN',
            'phone' => $this->randomPhone(),
            'role' => 'WAITER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
            'failedAttempts' => 0,
        ]);

        $response = $this->postJson('/api/auth/login', [
            'staffId' => $staffId,
            'pin' => '9999',
        ]);

        $response->assertStatus(401)
            ->assertJsonFragment(['statusCode' => 401]);

        $staff->delete();
    }

    public function test_failed_attempt_increment()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Test Staff Attempt',
            'phone' => $this->randomPhone(),
            'role' => 'CASHIER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
            'failedAttempts' => 0,
        ]);

        $this->postJson('/api/auth/login', [
            'staffId' => $staffId,
            'pin' => '0000',
        ]);

        $staff->refresh();
        $this->assertEquals(1, $staff->failedAttempts);

        $staff->delete();
    }

    public function test_account_lockout_trigger()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Test Lockout Target',
            'phone' => $this->randomPhone(),
            'role' => 'WAITER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
            'failedAttempts' => 4,
        ]);

        $response = $this->postJson('/api/auth/login', [
            'staffId' => $staffId,
            'pin' => '0000',
        ]);

        $response->assertStatus(401);
        $staff->refresh();

        $this->assertNotNull($staff->lockedUntil);
        $this->assertTrue(strtotime($staff->lockedUntil) > time());

        $staff->delete();
    }

    public function test_locked_account_rejection()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Locked Staff',
            'phone' => $this->randomPhone(),
            'role' => 'WAITER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
            'failedAttempts' => 5,
            'lockedUntil' => date('Y-m-d H:i:s', time() + 600),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'staffId' => $staffId,
            'pin' => '1234',
        ]);

        $response->assertStatus(403)
            ->assertJsonFragment(['statusCode' => 403]);

        $staff->delete();
    }

    public function test_expired_session_rejection()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Expired Session Staff',
            'phone' => $this->randomPhone(),
            'role' => 'MANAGER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
        ]);

        $sessionId = (string)Str::uuid();
        $token = JwtHelper::generateToken([
            'sub' => $staffId,
            'role' => 'MANAGER',
            'sid' => $sessionId,
        ], env('JWT_SECRET', 'dev-secret-key'));

        StaffSession::create([
            'id' => $sessionId,
            'staffId' => $staffId,
            'token' => hash('sha256', $token),
            'expiredAt' => date('Y-m-d H:i:s', time() - 600),
            'isActive' => true,
            'createdAt' => date('Y-m-d H:i:s', time() - 3600),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/auth/me');

        $response->assertStatus(401);

        $staff->sessions()->delete();
        $staff->delete();
    }

    public function test_revoked_session_rejection()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Revoked Staff',
            'phone' => $this->randomPhone(),
            'role' => 'MANAGER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
        ]);

        $sessionId = (string)Str::uuid();
        $token = JwtHelper::generateToken([
            'sub' => $staffId,
            'role' => 'MANAGER',
            'sid' => $sessionId,
        ], env('JWT_SECRET', 'dev-secret-key'));

        StaffSession::create([
            'id' => $sessionId,
            'staffId' => $staffId,
            'token' => hash('sha256', $token),
            'expiredAt' => date('Y-m-d H:i:s', time() + 43200),
            'isActive' => false,
            'createdAt' => date('Y-m-d H:i:s'),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/auth/me');

        $response->assertStatus(401);

        $staff->sessions()->delete();
        $staff->delete();
    }

    public function test_inactive_staff_rejection()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Inactive Staff',
            'phone' => $this->randomPhone(),
            'role' => 'WAITER',
            'pinHash' => Hash::make('1234'),
            'status' => 'INACTIVE',
        ]);

        $response = $this->postJson('/api/auth/login', [
            'staffId' => $staffId,
            'pin' => '1234',
        ]);

        $response->assertStatus(403);

        $staff->delete();
    }

    public function test_valid_authenticated_session()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Valid Session Staff',
            'phone' => $this->randomPhone(),
            'role' => 'OWNER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
        ]);

        $sessionId = (string)Str::uuid();
        $token = JwtHelper::generateToken([
            'sub' => $staffId,
            'role' => 'OWNER',
            'sid' => $sessionId,
        ], env('JWT_SECRET', 'dev-secret-key'));

        StaffSession::create([
            'id' => $sessionId,
            'staffId' => $staffId,
            'token' => hash('sha256', $token),
            'expiredAt' => date('Y-m-d H:i:s', time() + 43200),
            'isActive' => true,
            'createdAt' => date('Y-m-d H:i:s'),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/auth/me');

        $response->assertStatus(200)
            ->assertJson([
                'id' => $staffId,
                'role' => 'OWNER',
            ]);

        $staff->sessions()->delete();
        $staff->delete();
    }

    public function test_role_authorization_middleware()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Waiter Role Staff',
            'phone' => $this->randomPhone(),
            'role' => 'WAITER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
        ]);

        $sessionId = (string)Str::uuid();
        $token = JwtHelper::generateToken([
            'sub' => $staffId,
            'role' => 'WAITER',
            'sid' => $sessionId,
        ], env('JWT_SECRET', 'dev-secret-key'));

        StaffSession::create([
            'id' => $sessionId,
            'staffId' => $staffId,
            'token' => hash('sha256', $token),
            'expiredAt' => date('Y-m-d H:i:s', time() + 43200),
            'isActive' => true,
            'createdAt' => date('Y-m-d H:i:s'),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/staff');

        $response->assertStatus(403);

        $staff->sessions()->delete();
        $staff->delete();
    }

    public function test_logout_endpoint()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Logout Staff',
            'phone' => $this->randomPhone(),
            'role' => 'CASHIER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
        ]);

        $sessionId = (string)Str::uuid();
        $token = JwtHelper::generateToken([
            'sub' => $staffId,
            'role' => 'CASHIER',
            'sid' => $sessionId,
        ], env('JWT_SECRET', 'dev-secret-key'));

        StaffSession::create([
            'id' => $sessionId,
            'staffId' => $staffId,
            'token' => hash('sha256', $token),
            'expiredAt' => date('Y-m-d H:i:s', time() + 43200),
            'isActive' => true,
            'createdAt' => date('Y-m-d H:i:s'),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/auth/logout');

        $response->assertStatus(200)
            ->assertJson(['message' => 'Logged out successfully']);

        $staff->sessions()->delete();
        $staff->delete();
    }

    public function test_change_pin_endpoint()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Change PIN Staff',
            'phone' => $this->randomPhone(),
            'role' => 'CASHIER',
            'pinHash' => Hash::make('1234'),
            'mustChangePin' => true,
            'status' => 'ACTIVE',
        ]);

        $sessionId = (string)Str::uuid();
        $token = JwtHelper::generateToken([
            'sub' => $staffId,
            'role' => 'CASHIER',
            'sid' => $sessionId,
        ], env('JWT_SECRET', 'dev-secret-key'));

        StaffSession::create([
            'id' => $sessionId,
            'staffId' => $staffId,
            'token' => hash('sha256', $token),
            'expiredAt' => date('Y-m-d H:i:s', time() + 43200),
            'isActive' => true,
            'createdAt' => date('Y-m-d H:i:s'),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/auth/change-pin', [
                'currentPin' => '1234',
                'newPin' => '5678',
            ]);

        $response->assertStatus(200)
            ->assertJson(['message' => 'PIN updated successfully']);

        $staff->refresh();
        $this->assertFalse((bool)$staff->mustChangePin);
        $this->assertTrue(Hash::check('5678', $staff->pinHash));

        $staff->sessions()->delete();
        $staff->delete();
    }

    public function test_must_change_pin_flag_reflected()
    {
        $staffId = (string)Str::uuid();
        $staff = Staff::create([
            'id' => $staffId,
            'name' => 'Must Change PIN Staff',
            'phone' => $this->randomPhone(),
            'role' => 'WAITER',
            'pinHash' => Hash::make('1234'),
            'mustChangePin' => true,
            'status' => 'ACTIVE',
        ]);

        $sessionId = (string)Str::uuid();
        $token = JwtHelper::generateToken([
            'sub' => $staffId,
            'role' => 'WAITER',
            'sid' => $sessionId,
        ], env('JWT_SECRET', 'dev-secret-key'));

        StaffSession::create([
            'id' => $sessionId,
            'staffId' => $staffId,
            'token' => hash('sha256', $token),
            'expiredAt' => date('Y-m-d H:i:s', time() + 43200),
            'isActive' => true,
            'createdAt' => date('Y-m-d H:i:s'),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/auth/me');

        $response->assertStatus(200)
            ->assertJson([
                'mustChangePin' => true,
            ]);

        $staff->sessions()->delete();
        $staff->delete();
    }
}
