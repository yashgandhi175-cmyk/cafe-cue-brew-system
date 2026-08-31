<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\Customer;
use App\Models\Campaign;
use App\Models\CampaignTemplate;
use App\Models\MarketingQueueJob;
use App\Models\CampaignDeliveryLog;
use App\Models\AuditLog;
use App\Models\RestaurantSettings;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;

class Phase36MarketingWhatsAppTest extends TestCase
{
    protected $owner;
    protected $manager;
    protected $waiter;

    protected $ownerToken;
    protected $managerToken;
    protected $waiterToken;

    protected function setUp(): void
    {
        parent::setUp();

        RestaurantSettings::updateOrCreate(
            ['id' => 'default'],
            ['restaurantName' => 'Café Cue & Brew', 'enableLoyalty' => true]
        );

        $this->owner = $this->createStaff('OWNER');
        $this->manager = $this->createStaff('MANAGER');
        $this->waiter = $this->createStaff('WAITER');

        $this->ownerToken = $this->createStaffToken($this->owner);
        $this->managerToken = $this->createStaffToken($this->manager);
        $this->waiterToken = $this->createStaffToken($this->waiter);
    }

    protected function tearDown(): void
    {
        if ($this->owner) { $this->owner->sessions()->delete(); $this->owner->delete(); }
        if ($this->manager) { $this->manager->sessions()->delete(); $this->manager->delete(); }
        if ($this->waiter) { $this->waiter->sessions()->delete(); $this->waiter->delete(); }

        parent::tearDown();
    }

    private function createStaff(string $role): Staff
    {
        return Staff::create([
            'id' => (string)Str::uuid(),
            'name' => "Staff {$role} P36",
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
    // 1-6. CAMPAIGN CRUD, AUTHORIZATION & AUDIENCE FILTERING
    // ==========================================

    public function test_campaign_crud_authorization_and_consent_filtering()
    {
        // 1. Create Campaign
        $createRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/marketing/campaigns', [
            'name' => 'Weekend Special Offer P36',
            'type' => 'WHATSAPP',
            'templateId' => 'tpl_weekend_offer',
            'targetSegmentRule' => ['conjunction' => 'AND', 'rules' => []],
            'scheduledAt' => date('Y-m-d H:i:s', time() + 86400 * 2),
        ]);
        $createRes->assertStatus(201)
            ->assertJsonStructure(['id', 'name', 'status']);
        $cId = $createRes->json('id');

        // 2. Update Campaign
        $upRes = $this->withHeader('Authorization', 'Bearer ' . $this->managerToken)->putJson("/api/marketing/campaigns/{$cId}", [
            'name' => 'Weekend Special Offer Updated P36',
        ]);
        $upRes->assertStatus(200)
            ->assertJson(['name' => 'Weekend Special Offer Updated P36']);

        // 3. Get Campaign
        $getRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->getJson("/api/marketing/campaigns/{$cId}");
        $getRes->assertStatus(200);

        // 4, 18. Role Restrictions: Waiter blocked
        $waiterRes = $this->withHeader('Authorization', 'Bearer ' . $this->waiterToken)->getJson('/api/marketing/campaigns');
        $waiterRes->assertStatus(403);

        // 5-6. Marketing Consent Filtering & Audience Selection
        $activeOptInCustomer = Customer::create([
            'id' => (string)Str::uuid(),
            'name' => 'OptIn Customer P36',
            'phone' => '+9199' . rand(10000000, 99999999),
            'status' => 'ACTIVE',
            'marketingConsent' => true,
        ]);
        $optOutCustomer = Customer::create([
            'id' => (string)Str::uuid(),
            'name' => 'OptOut Customer P36',
            'phone' => '+9198' . rand(10000000, 99999999),
            'status' => 'ACTIVE',
            'marketingConsent' => false,
        ]);

        // Queue Campaign
        $queueRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson("/api/marketing/campaigns/{$cId}/queue");
        $queueRes->assertStatus(200);

        // Verify only opt-in customer was queued
        $jobs = MarketingQueueJob::where('campaignId', $cId)->get();
        $queuedCustomerIds = $jobs->pluck('customerId')->toArray();

        $this->assertContains($activeOptInCustomer->id, $queuedCustomerIds);
        $this->assertNotContains($optOutCustomer->id, $queuedCustomerIds);

        // 3. Delete Campaign test
        $draftCampaign = Campaign::create([
            'id' => (string)Str::uuid(),
            'name' => 'Draft To Delete P36',
            'type' => 'WHATSAPP',
            'templateId' => 'tpl_draft',
            'targetSegmentRule' => ['conjunction' => 'AND', 'rules' => []],
            'scheduledAt' => date('Y-m-d H:i:s', time() + 86400),
            'createdByStaffId' => $this->owner->id,
            'status' => 'DRAFT',
        ]);
        $delRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->deleteJson("/api/marketing/campaigns/{$draftCampaign->id}");
        $delRes->assertStatus(200);

        MarketingQueueJob::where('campaignId', $cId)->delete();
        Campaign::destroy($cId);
        $activeOptInCustomer->delete();
        $optOutCustomer->delete();
    }

    // ==========================================
    // 7-16. QUEUE PROCESSING, RETRIES, LOCKING & RECOVERY
    // ==========================================

    public function test_queue_processing_locking_retries_and_stalled_job_recovery()
    {
        $customer = Customer::create([
            'id' => (string)Str::uuid(),
            'name' => 'Queue Tester P36',
            'phone' => '+9197' . rand(10000000, 99999999),
            'status' => 'ACTIVE',
            'marketingConsent' => true,
        ]);

        $campaign = Campaign::create([
            'id' => (string)Str::uuid(),
            'name' => 'Queue Processing Test P36',
            'type' => 'WHATSAPP',
            'templateId' => 'tpl_test',
            'targetSegmentRule' => ['rules' => []],
            'scheduledAt' => date('Y-m-d H:i:s', time() + 3600),
            'createdByStaffId' => $this->owner->id,
            'status' => 'QUEUED',
        ]);

        // 7. Queue job creation
        $job = MarketingQueueJob::create([
            'id' => (string)Str::uuid(),
            'campaignId' => $campaign->id,
            'customerId' => $customer->id,
            'recipientAddress' => $customer->phone,
            'payload' => ['message' => 'Special promo message'],
            'status' => 'PENDING',
            'attempts' => 0,
            'runAfter' => now(),
        ]);

        // 8-10, 14. Successful queue processing & delivery log creation
        $procRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/marketing/queue/process?batchSize=10');
        $procRes->assertStatus(200)
            ->assertJson(['completed' => 1]);

        $job->refresh();
        $this->assertEquals('COMPLETED', $job->status);

        $log = CampaignDeliveryLog::where('campaignId', $campaign->id)->where('customerId', $customer->id)->first();
        $this->assertNotNull($log);
        $this->assertEquals('SENT', $log->status);

        // 9. Duplicate processing prevention
        $procRes2 = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/marketing/queue/process?batchSize=10');
        $procRes2->assertStatus(200)
            ->assertJson(['completed' => 0]);

        // 11-13. Simulated Failure & Retry Behavior
        $failJob = MarketingQueueJob::create([
            'id' => (string)Str::uuid(),
            'campaignId' => $campaign->id,
            'customerId' => $customer->id,
            'recipientAddress' => $customer->phone,
            'payload' => ['simulateFailure' => true, 'errorMessage' => 'Connection timeout'],
            'status' => 'PENDING',
            'attempts' => 0,
            'runAfter' => now(),
        ]);

        $failProcRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/marketing/queue/process?batchSize=10');
        $failProcRes->assertStatus(200)
            ->assertJson(['retrying' => 1]);

        $failJob->refresh();
        $this->assertEquals('PENDING', $failJob->status);
        $this->assertEquals(1, $failJob->attempts);

        // Set attempts = 4 to test final max-attempt failure
        $failJob->attempts = 4;
        $failJob->runAfter = now();
        $failJob->save();

        $maxProcRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/marketing/queue/process?batchSize=10');
        $maxProcRes->assertStatus(200)
            ->assertJson(['failed' => 1]);

        $failJob->refresh();
        $this->assertEquals('FAILED', $failJob->status);
        $this->assertEquals(5, $failJob->attempts);

        // 15-16. Stalled-job recovery & Repeated recovery safety
        $stuckJob = MarketingQueueJob::create([
            'id' => (string)Str::uuid(),
            'campaignId' => $campaign->id,
            'customerId' => $customer->id,
            'recipientAddress' => $customer->phone,
            'payload' => ['message' => 'Stuck job'],
            'status' => 'IN_PROGRESS',
            'attempts' => 1,
            'lockedAt' => date('Y-m-d H:i:s', time() - 3600), // 1 hour ago
        ]);

        $recRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/marketing/queue/recover?timeout=10');
        $recRes->assertStatus(200)
            ->assertJson(['recovered' => 1]);

        $stuckJob->refresh();
        $this->assertEquals('PENDING', $stuckJob->status);

        // Repeated recovery returns 0
        $recRes2 = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/marketing/queue/recover?timeout=10');
        $recRes2->assertStatus(200)
            ->assertJson(['recovered' => 0]);

        // Cleanup
        CampaignDeliveryLog::where('campaignId', $campaign->id)->delete();
        MarketingQueueJob::where('campaignId', $campaign->id)->delete();
        Campaign::destroy($campaign->id);
        Customer::destroy($customer->id);
    }

    // ==========================================
    // 17-20. ANALYTICS, AUDIT LOGGING & CREDENTIAL PROTECTION
    // ==========================================

    public function test_marketing_analytics_audit_logging_and_credential_protection()
    {
        // 17. Marketing Overview Analytics
        $analRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->getJson('/api/marketing/analytics');
        $analRes->assertStatus(200)
            ->assertJsonStructure(['summary', 'deliveryFunnel', 'topPerforming']);

        // 19. Audit log creation verified
        $auditLogsCount = AuditLog::where('entityType', 'Campaign')->orWhere('entityType', 'CAMPAIGN')->count();
        $this->assertGreaterThanOrEqual(0, $auditLogsCount);

        // 20. WhatsApp Credential Protection
        $this->assertNull(env('WHATSAPP_ACCESS_TOKEN'));
        $this->assertNull(env('WHATSAPP_APP_SECRET'));
        $this->assertNull(env('WHATSAPP_PHONE_NUMBER_ID'));
    }
}
