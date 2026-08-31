<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Support\JwtHelper;
use App\Services\FinancialCalculationService;
use App\Http\Middleware\CheckRole;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class Phase7HardeningTest extends TestCase
{
    public function test_health_check_returns_200_and_json_structure(): void
    {
        $response = $this->getJson('/api/health');

        $response->assertStatus(200)
                 ->assertJsonStructure([
                     'status',
                     'system',
                     'laravel',
                     'version',
                     'timestamp',
                 ])
                 ->assertJson(['status' => 'ok']);
    }

    public function test_unauthenticated_request_is_rejected_with_401(): void
    {
        $response = $this->getJson('/api/auth/me');

        $response->assertStatus(401)
                 ->assertJson([
                     'message' => 'Unauthorized: Missing token',
                     'statusCode' => 401,
                 ]);
    }

    public function test_invalid_pin_login_is_rejected(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'staffId' => 'non-existent-id',
            'pin' => '0000',
        ]);

        $response->assertStatus(401);
    }

    public function test_financial_calculation_service_rounding_and_totals(): void
    {
        $service = new FinancialCalculationService();
        $calc = $service->calculate([
            'subtotal' => 340.00,
            'manualDiscount' => 10.00,
            'couponDiscount' => 15.00,
            'loyaltyDiscount' => 5.00,
        ]);

        $this->assertEquals(340.00, $calc['subtotal']);
        $this->assertEquals(30.00, $calc['discount']);
        $this->assertEquals(310.00, $calc['baseTaxableAmount']);
        $this->assertEquals(295.24, $calc['taxableAmount']);
        $this->assertEquals(7.38, $calc['cgst']);
        $this->assertEquals(7.38, $calc['sgst']);
        $this->assertEquals(310.00, $calc['grandTotal']);
    }

    public function test_jwt_helper_token_generation_and_validation(): void
    {
        $payload = [
            'staffId' => 'test-staff-123',
            'sessionId' => 'test-session-456',
            'role' => 'MANAGER',
        ];

        $token = JwtHelper::generateToken($payload, 'test-secret');
        $this->assertNotEmpty($token);

        $decoded = JwtHelper::decodeToken($token, 'test-secret');
        $this->assertNotNull($decoded);
        $this->assertEquals('test-staff-123', $decoded['staffId']);
        $this->assertEquals('MANAGER', $decoded['role']);
    }

    public function test_jwt_helper_rejects_invalid_signature(): void
    {
        $payload = ['staffId' => 'test-staff-123'];
        $token = JwtHelper::generateToken($payload, 'secret-a');

        $decoded = JwtHelper::decodeToken($token, 'secret-b');
        $this->assertNull($decoded);
    }

    public function test_role_authorization_middleware_denies_unauthorized_role(): void
    {
        $middleware = new CheckRole();

        $request = Request::create('/api/staff', 'GET');
        $request->attributes->set('auth_staff', (object)['role' => 'WAITER']);

        $response = $middleware->handle($request, function () {
            return response()->json(['status' => 'success']);
        }, 'OWNER', 'MANAGER');

        $this->assertEquals(403, $response->getStatusCode());
    }
}
