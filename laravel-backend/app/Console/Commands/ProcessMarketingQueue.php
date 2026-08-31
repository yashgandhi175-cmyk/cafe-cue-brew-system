<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\MarketingQueueService;

class ProcessMarketingQueue extends Command
{
    protected $signature = 'marketing:process-queue {--batchSize=50} {--executionTimeout=25}';
    protected $description = 'Process pending marketing queue jobs and send WhatsApp dispatches';

    public function handle(MarketingQueueService $queueService): int
    {
        $batchSize = (int)$this->option('batchSize');
        $executionTimeout = (int)$this->option('executionTimeout');
        $timeoutMs = $executionTimeout * 1000;

        $this->info("Starting marketing queue processor (batchSize={$batchSize}, timeout={$executionTimeout}s)...");
        $res = $queueService->processBatch($batchSize, $timeoutMs);

        $this->info("Completed: processed {$res['processed']} jobs (completed: {$res['completed']}, failed: {$res['failed']}, retrying: {$res['retrying']}).");
        return 0;
    }
}
