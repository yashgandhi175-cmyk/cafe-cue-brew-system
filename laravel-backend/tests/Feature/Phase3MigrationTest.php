<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Services\FinancialCalculationService;
use App\Support\JwtHelper;

class Phase3MigrationTest extends TestCase
{
    public function test_api_health_endpoint_returns_ok_json(): void
    {
        $response = $this->getJson('/api/health');
        $response->assertStatus(200)
                 ->assertJson([
                     'status' => 'ok',
                     'system' => 'Café Cue & Brew Laravel Backend Foundation',
                 ]);
    }

    public function test_jwt_helper_encodes_and_decodes_correctly(): void
    {
        $secret = 'test-secret-key-12345';
        $payload = ['sub' => 'staff-uuid-1', 'role' => 'MANAGER', 'sid' => 'session-uuid-1'];

        $token = JwtHelper::generateToken($payload, $secret);
        $this->assertNotEmpty($token);

        $decoded = JwtHelper::decodeToken($token, $secret);
        $this->assertNotNull($decoded);
        $this->assertEquals('staff-uuid-1', $decoded['sub']);
        $this->assertEquals('MANAGER', $decoded['role']);
    }

    public function test_financial_calculation_service_matches_billing_formulas(): void
    {
        $calcService = new FinancialCalculationService();
        $result = $calcService->calculate([
            'subtotal' => 1000.00,
            'manualDiscount' => 100.00,
            'couponDiscount' => 50.00,
            'settings' => null,
        ]);

        $this->assertEquals(1000.00, $result['subtotal']);
        $this->assertEquals(150.00, $result['discount']);
        $this->assertEquals(850.00, $result['baseTaxableAmount']);
        $this->assertGreaterThan(0, $result['grandTotal']);
    }
}
