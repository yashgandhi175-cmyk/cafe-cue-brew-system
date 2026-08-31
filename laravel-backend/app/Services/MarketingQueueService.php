<?php

namespace App\Services;

use App\Models\MarketingQueueJob;
use App\Models\CampaignDeliveryLog;
use App\Models\Campaign;
use App\Models\Staff;
use App\Models\AuditLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MarketingQueueService
{
    protected $whatsAppService;

    public function __construct(WhatsAppService $whatsAppService)
    {
        $this->whatsAppService = $whatsAppService;
    }

    public function createJobs(string $campaignId, array $recipients): int
    {
        $now = now();
        $records = [];
        foreach ($recipients as $r) {
            $records[] = [
                'id' => (string)Str::uuid(),
                'campaignId' => $campaignId,
                'customerId' => $r['customerId'] ?? null,
                'recipientAddress' => $r['address'],
                'payload' => json_encode($r['payload']),
                'status' => 'PENDING',
                'attempts' => 0,
                'runAfter' => $now,
                'lockedAt' => null,
                'errorLog' => null,
                'createdAt' => $now,
                'updatedAt' => $now,
            ];
        }

        if (count($records) > 0) {
            DB::table('MarketingQueueJob')->insert($records);
        }

        return count($records);
    }

    public function processBatch(int $batchSize = 50, int $executionTimeoutMs = 25000): array
    {
        $startTime = microtime(true) * 1000;

        $jobsToProcess = DB::transaction(function () use ($batchSize) {
            $lockedJobs = DB::select("
                SELECT id, payload, attempts, campaignId, customerId, recipientAddress
                FROM `MarketingQueueJob`
                WHERE `status` = 'PENDING'
                  AND `runAfter` <= NOW()
                  AND `attempts` < 5
                LIMIT {$batchSize}
                FOR UPDATE
            ");

            if (empty($lockedJobs)) {
                return [];
            }

            $ids = array_map(fn($j) => "'{$j->id}'", $lockedJobs);
            $idString = implode(',', $ids);

            DB::statement("
                UPDATE `MarketingQueueJob`
                SET `status` = 'IN_PROGRESS', `lockedAt` = NOW()
                WHERE `id` IN ({$idString})
            ");

            return array_map(function ($j) {
                return [
                    'id' => $j->id,
                    'campaignId' => $j->campaignId,
                    'customerId' => $j->customerId,
                    'recipientAddress' => $j->recipientAddress,
                    'payload' => is_string($j->payload) ? json_decode($j->payload, true) : $j->payload,
                    'attempts' => (int)$j->attempts,
                ];
            }, $lockedJobs);
        });

        if (empty($jobsToProcess)) {
            return ['processed' => 0, 'completed' => 0, 'failed' => 0, 'retrying' => 0];
        }

        $completed = 0;
        $failed = 0;
        $retrying = 0;

        foreach ($jobsToProcess as $index => $job) {
            $elapsedMs = (microtime(true) * 1000) - $startTime;
            if ($elapsedMs >= $executionTimeoutMs) {
                // Revert remaining jobs in batch back to PENDING
                $remainingJobs = array_slice($jobsToProcess, $index);
                $remainingIds = array_map(fn($j) => "'{$j['id']}'", $remainingJobs);
                if (!empty($remainingIds)) {
                    $idStr = implode(',', $remainingIds);
                    DB::statement("
                        UPDATE `MarketingQueueJob`
                        SET `status` = 'PENDING', `lockedAt` = NULL
                        WHERE `id` IN ({$idStr})
                    ");
                }
                break;
            }

            try {
                if (!empty($job['payload']['simulateFailure'])) {
                    throw new \Exception($job['payload']['errorMessage'] ?? 'Simulated execution failure');
                }

                $res = $this->whatsAppService->send($job['recipientAddress'], $job['payload']);

                // Mark COMPLETED
                DB::table('MarketingQueueJob')->where('id', $job['id'])->update([
                    'status' => 'COMPLETED',
                    'lockedAt' => null,
                    'attempts' => $job['attempts'] + 1,
                    'updatedAt' => now(),
                ]);

                // Create CampaignDeliveryLog idempotently
                $existingLog = DB::table('CampaignDeliveryLog')
                    ->where('campaignId', $job['campaignId'])
                    ->where('recipientAddress', $job['recipientAddress'])
                    ->first();

                if (!$existingLog) {
                    DB::table('CampaignDeliveryLog')->insert([
                        'id' => (string)Str::uuid(),
                        'campaignId' => $job['campaignId'],
                        'customerId' => $job['customerId'],
                        'recipientAddress' => $job['recipientAddress'],
                        'messageSid' => $res['messageSid'] ?? ('wa-link-' . (int)(microtime(true) * 1000)),
                        'status' => 'SENT',
                        'errorCode' => null,
                        'sentAt' => now(),
                        'createdAt' => now(),
                    ]);
                }

                $completed++;
            } catch (\Exception $e) {
                $nextAttempts = $job['attempts'] + 1;
                $errorMsg = $e->getMessage() ?: 'Execution error';

                if ($nextAttempts < 5) {
                    $backoffMins = pow(2, $nextAttempts);
                    $runAfter = date('Y-m-d H:i:s', time() + ($backoffMins * 60));

                    DB::table('MarketingQueueJob')->where('id', $job['id'])->update([
                        'status' => 'PENDING',
                        'attempts' => $nextAttempts,
                        'runAfter' => $runAfter,
                        'lockedAt' => null,
                        'errorLog' => "{$errorMsg} (Retrying in {$backoffMins} mins)",
                        'updatedAt' => now(),
                    ]);
                    $retrying++;
                } else {
                    DB::table('MarketingQueueJob')->where('id', $job['id'])->update([
                        'status' => 'FAILED',
                        'attempts' => $nextAttempts,
                        'lockedAt' => null,
                        'errorLog' => "{$errorMsg} - Max attempts reached (FAILED_FINAL)",
                        'updatedAt' => now(),
                    ]);

                    $existingLog = DB::table('CampaignDeliveryLog')
                        ->where('campaignId', $job['campaignId'])
                        ->where('recipientAddress', $job['recipientAddress'])
                        ->first();

                    if (!$existingLog) {
                        DB::table('CampaignDeliveryLog')->insert([
                            'id' => (string)Str::uuid(),
                            'campaignId' => $job['campaignId'],
                            'customerId' => $job['customerId'],
                            'recipientAddress' => $job['recipientAddress'],
                            'messageSid' => null,
                            'status' => 'FAILED',
                            'errorCode' => 'DISPATCH_ERROR',
                            'sentAt' => now(),
                            'createdAt' => now(),
                        ]);
                    }
                    $failed++;
                }
            }
        }

        $processed = $completed + $failed + $retrying;
        return [
            'processed' => $processed,
            'completed' => $completed,
            'failed' => $failed,
            'retrying' => $retrying,
        ];
    }

    public function recoverStaleJobs(int $timeoutMinutes = 10): array
    {
        $cutoff = date('Y-m-d H:i:s', time() - ($timeoutMinutes * 60));

        $staleJobs = DB::table('MarketingQueueJob')
            ->where('status', 'IN_PROGRESS')
            ->where('lockedAt', '<=', $cutoff)
            ->get(['id', 'attempts']);

        if ($staleJobs->isEmpty()) {
            return ['recovered' => 0];
        }

        DB::transaction(function () use ($staleJobs) {
            foreach ($staleJobs as $job) {
                DB::table('MarketingQueueJob')->where('id', $job->id)->update([
                    'status' => 'PENDING',
                    'attempts' => (int)$job->attempts + 1,
                    'lockedAt' => null,
                    'errorLog' => 'Reclaimed after lock timeout (stale job recovery)',
                    'updatedAt' => now(),
                ]);
            }
        });

        return ['recovered' => count($staleJobs)];
    }

    public function getQueueStatus(): array
    {
        $groups = DB::table('MarketingQueueJob')
            ->select('status', DB::raw('COUNT(*) as total'))
            ->groupBy('status')
            ->get();

        $counts = [
            'PENDING' => 0,
            'IN_PROGRESS' => 0,
            'COMPLETED' => 0,
            'FAILED' => 0,
        ];

        foreach ($groups as $g) {
            if (isset($counts[$g->status])) {
                $counts[$g->status] = (int)$g->total;
            }
        }

        return $counts;
    }
}
