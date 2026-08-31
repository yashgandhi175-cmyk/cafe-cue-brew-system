<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\MarketingQueueService;

class RecoverStalledMarketingQueue extends Command
{
    protected $signature = 'marketing:recover-stalled {--timeout=10}';
    protected $description = 'Recover stale in-progress marketing queue jobs';

    public function handle(MarketingQueueService $queueService): int
    {
        $timeout = (int)$this->option('timeout');
        $this->info("Starting stalled marketing queue recovery (timeout={$timeout}m)...");
        $res = $queueService->recoverStaleJobs($timeout);

        $this->info("Completed: recovered {$res['recovered']} stale jobs.");
        return 0;
    }
}
