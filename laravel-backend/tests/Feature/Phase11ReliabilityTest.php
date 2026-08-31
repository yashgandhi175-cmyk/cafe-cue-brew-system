<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class Phase11ReliabilityTest extends TestCase
{
    public function test_unauthenticated_order_creation_is_rejected_with_401(): void
    {
        $response = $this->postJson('/api/orders', []);

        $response->assertStatus(401)
                 ->assertJson([
                     'message' => 'Unauthorized: Missing token',
                     'statusCode' => 401,
                 ]);
    }

    public function test_unauthenticated_payment_creation_is_rejected_with_401(): void
    {
        $response = $this->postJson('/api/payments', []);

        $response->assertStatus(401)
                 ->assertJson([
                     'message' => 'Unauthorized: Missing token',
                     'statusCode' => 401,
                 ]);
    }

    public function test_unauthenticated_staff_creation_is_rejected_with_401(): void
    {
        $response = $this->postJson('/api/staff', [
            'name' => 'John Doe',
            'phone' => '1234567890',
            'role' => 'WAITER',
            'pin' => '1234',
        ]);

        $response->assertStatus(401);
    }

    public function test_upload_security_rejects_unauthenticated_requests(): void
    {
        Storage::fake('public');

        $file = UploadedFile::fake()->create('malicious.php', 100, 'text/x-php');

        $response = $this->postJson('/api/uploads', [
            'file' => $file,
        ]);

        $response->assertStatus(401);
    }

    public function test_marketing_queue_process_rejects_unauthenticated_requests(): void
    {
        $response = $this->postJson('/api/marketing/queue/process');

        $response->assertStatus(401);
    }
}
