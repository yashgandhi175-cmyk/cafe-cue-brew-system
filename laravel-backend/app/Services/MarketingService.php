<?php

namespace App\Services;

use App\Models\Campaign;
use App\Models\Coupon;
use App\Models\Customer;
use App\Models\CampaignDeliveryLog;
use App\Models\MarketingQueueJob;
use App\Models\AuditLog;
use App\Models\Staff;
use App\Models\RestaurantSettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MarketingService
{
    protected $audienceService;
    protected $marketingQueueService;

    public function __construct(AudienceService $audienceService, MarketingQueueService $marketingQueueService)
    {
        $this->audienceService = $audienceService;
        $this->marketingQueueService = $marketingQueueService;
    }

    public function createCampaign(array $dto, string $staffId): Campaign
    {
        if (!empty($dto['couponId'])) {
            if (!Coupon::where('id', $dto['couponId'])->exists()) {
                throw new \Exception('Coupon not found.', 404);
            }
        }

        if (strtotime($dto['scheduledAt']) < time()) {
            throw new \Exception('Scheduled date must be in the future.', 400);
        }

        return DB::transaction(function () use ($dto, $staffId) {
            $campaign = Campaign::create([
                'id' => (string)Str::uuid(),
                'name' => trim($dto['name']),
                'type' => $dto['type'],
                'status' => 'DRAFT',
                'templateId' => $dto['templateId'],
                'templateVariables' => $dto['templateVariables'] ?? null,
                'targetSegmentRule' => $dto['targetSegmentRule'],
                'couponId' => $dto['couponId'] ?? null,
                'scheduledAt' => $dto['scheduledAt'],
                'createdByStaffId' => $staffId,
            ]);

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staffId,
                'action' => 'CAMPAIGN_CREATE',
                'entityType' => 'Campaign',
                'entityId' => $campaign->id,
                'newData' => json_encode($campaign->toArray()),
                'ipAddress' => '127.0.0.1',
                'createdAt' => now(),
            ]);

            return $campaign;
        });
    }

    public function getCampaigns(array $query): array
    {
        $dbQuery = Campaign::with(['coupon:id,code,name', 'createdBy:id,name']);

        if (!empty($query['status'])) {
            $dbQuery->where('status', $query['status']);
        }
        if (!empty($query['type'])) {
            $dbQuery->where('type', $query['type']);
        }
        if (!empty($query['search'])) {
            $dbQuery->where('name', 'LIKE', '%' . trim($query['search']) . '%');
        }

        $page = max(1, (int)($query['page'] ?? 1));
        $limit = min(100, max(1, (int)($query['limit'] ?? 20)));
        $skip = ($page - 1) * $limit;

        $total = $dbQuery->count();
        $items = $dbQuery->orderBy('createdAt', 'desc')
            ->skip($skip)
            ->take($limit)
            ->get()
            ->toArray();

        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
        ];
    }

    public function getCampaignById(string $id): array
    {
        $campaign = Campaign::with(['coupon:id,code,name', 'createdBy:id,name'])->find($id);
        if (!$campaign) {
            throw new \Exception('Campaign not found.', 404);
        }
        return $campaign->toArray();
    }

    public function updateCampaign(string $id, array $dto, string $staffId): Campaign
    {
        $campaign = Campaign::find($id);
        if (!$campaign) {
            throw new \Exception('Campaign not found.', 404);
        }

        if ($campaign->status !== 'DRAFT') {
            throw new \Exception('Only campaigns in DRAFT status can be modified.', 400);
        }

        if (!empty($dto['couponId'])) {
            if (!Coupon::where('id', $dto['couponId'])->exists()) {
                throw new \Exception('Coupon not found.', 404);
            }
        }

        if (!empty($dto['scheduledAt']) && strtotime($dto['scheduledAt']) < time()) {
            throw new \Exception('Scheduled date must be in the future.', 400);
        }

        return DB::transaction(function () use ($campaign, $dto, $staffId) {
            $oldData = json_encode($campaign->toArray());

            if (isset($dto['name'])) $campaign->name = trim($dto['name']);
            if (isset($dto['type'])) $campaign->type = $dto['type'];
            if (isset($dto['templateId'])) $campaign->templateId = $dto['templateId'];
            if (array_key_exists('templateVariables', $dto)) $campaign->templateVariables = $dto['templateVariables'];
            if (isset($dto['targetSegmentRule'])) $campaign->targetSegmentRule = $dto['targetSegmentRule'];
            if (array_key_exists('couponId', $dto)) $campaign->couponId = $dto['couponId'];
            if (isset($dto['scheduledAt'])) $campaign->scheduledAt = $dto['scheduledAt'];

            $campaign->save();

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staffId,
                'action' => 'CAMPAIGN_UPDATE',
                'entityType' => 'Campaign',
                'entityId' => $campaign->id,
                'oldData' => $oldData,
                'newData' => json_encode($campaign->toArray()),
                'ipAddress' => '127.0.0.1',
                'createdAt' => now(),
            ]);

            return $campaign;
        });
    }

    public function deleteCampaign(string $id, string $staffId): array
    {
        $campaign = Campaign::find($id);
        if (!$campaign) {
            throw new \Exception('Campaign not found.', 404);
        }

        if (!in_array($campaign->status, ['DRAFT', 'CANCELLED'])) {
            throw new \Exception('Only DRAFT or CANCELLED campaigns can be deleted.', 400);
        }

        return DB::transaction(function () use ($campaign, $staffId) {
            $oldData = json_encode($campaign->toArray());
            $campaignId = $campaign->id;

            $campaign->delete();

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staffId,
                'action' => 'CAMPAIGN_DELETE',
                'entityType' => 'Campaign',
                'entityId' => $campaignId,
                'oldData' => $oldData,
                'ipAddress' => '127.0.0.1',
                'createdAt' => now(),
            ]);

            return ['success' => true];
        });
    }

    public function queueCampaign(string $campaignId): array
    {
        $campaign = Campaign::find($campaignId);
        if (!$campaign) {
            throw new \Exception('Campaign not found', 400);
        }

        if (!in_array($campaign->status, ['DRAFT', 'SCHEDULED'])) {
            throw new \Exception("Cannot queue campaign from status: {$campaign->status}", 400);
        }

        $existingJobsCount = MarketingQueueJob::where('campaignId', $campaignId)->count();
        if ($existingJobsCount > 0) {
            throw new \Exception('Queue jobs already exist for this campaign', 400);
        }

        $query = Customer::query();
        $query = $this->audienceService->applySegmentRuleGroup($query, $campaign->targetSegmentRule);
        $customers = $query->get(['id', 'phone']);

        $audienceCount = $customers->count();

        $rule = $campaign->targetSegmentRule ?? [];
        $rule['resolvedAudienceCount'] = $audienceCount;
        $campaign->targetSegmentRule = $rule;
        $campaign->status = 'QUEUED';
        $campaign->save();

        AuditLog::create([
            'id' => (string)Str::uuid(),
            'staffId' => $campaign->createdByStaffId,
            'action' => 'CAMPAIGN_QUEUED',
            'entityType' => 'CAMPAIGN',
            'entityId' => $campaignId,
            'newData' => json_encode(['status' => 'QUEUED', 'audienceCount' => $audienceCount]),
            'createdAt' => now(),
        ]);

        $recipients = $customers->map(fn($c) => [
            'customerId' => $c->id,
            'address' => $c->phone,
            'payload' => ['template' => ['name' => $campaign->templateId]],
        ])->toArray();

        if (count($recipients) > 0) {
            $this->marketingQueueService->createJobs($campaignId, $recipients);
        }

        return ['audienceCount' => $audienceCount];
    }

    public function cancelCampaign(string $campaignId): array
    {
        $campaign = Campaign::find($campaignId);
        if (!$campaign) {
            throw new \Exception('Campaign not found', 400);
        }

        if (in_array($campaign->status, ['COMPLETED', 'FAILED', 'CANCELLED'])) {
            throw new \Exception("Cannot cancel campaign from finished status: {$campaign->status}", 400);
        }

        $campaign->status = 'CANCELLED';
        $campaign->save();

        AuditLog::create([
            'id' => (string)Str::uuid(),
            'staffId' => $campaign->createdByStaffId,
            'action' => 'CAMPAIGN_CANCELLED',
            'entityType' => 'CAMPAIGN',
            'entityId' => $campaignId,
            'newData' => json_encode(['status' => 'CANCELLED']),
            'createdAt' => now(),
        ]);

        MarketingQueueJob::where('campaignId', $campaignId)->where('status', 'PENDING')->delete();

        return ['success' => true];
    }

    public function getCampaignAnalytics(string $campaignId): array
    {
        $campaign = Campaign::with('deliveryLogs')->find($campaignId);
        if (!$campaign) {
            throw new \Exception('Campaign not found', 404);
        }

        $logs = $campaign->deliveryLogs;
        $totalAudience = $logs->count();

        $messagesQueued = $logs->filter(fn($l) => $l->status === 'QUEUED')->count();
        $messagesSent = $logs->filter(fn($l) => in_array($l->status, ['SENT', 'DELIVERED', 'READ']))->count();
        $delivered = $logs->filter(fn($l) => in_array($l->status, ['DELIVERED', 'READ']))->count();
        $read = $logs->filter(fn($l) => $l->status === 'READ')->count();
        $failed = $logs->filter(fn($l) => in_array($l->status, ['FAILED', 'BOUNCED']))->count();

        $deliveryRate = $messagesSent > 0 ? round(($delivered / $messagesSent) * 100, 2) : 0.0;
        $readRate = $delivered > 0 ? round(($read / $delivered) * 100, 2) : 0.0;

        $costRate = ($campaign->type === 'WHATSAPP') ? 0.05 : (($campaign->type === 'EMAIL') ? 0.01 : (($campaign->type === 'SMS') ? 0.02 : 0.0));
        $campaignCost = round($messagesSent * $costRate, 2);

        $revenueGenerated = 0.0;
        $attributedOrdersCount = 0;
        $convertedCustomersCount = 0;
        $couponAttributions = 0;
        $loyaltyAttributions = 0;
        $repeatCustomerAttributions = 0;
        $firstTimeCustomerAttributions = 0;

        $targetedLogs = $logs->filter(fn($l) => in_array($l->status, ['SENT', 'DELIVERED', 'READ']));

        foreach ($targetedLogs as $log) {
            if (!$log->customerId || !$log->sentAt) continue;

            $sentTime = strtotime($log->sentAt);
            $cutoffTime = date('Y-m-d H:i:s', $sentTime + (72 * 3600));

            $orders = DB::table('Order')
                ->where('customerId', $log->customerId)
                ->where('status', 'COMPLETED')
                ->where('createdAt', '>=', date('Y-m-d H:i:s', $sentTime))
                ->where('createdAt', '<=', $cutoffTime)
                ->get();

            if ($orders->count() > 0) {
                $convertedCustomersCount++;
                $attributedOrdersCount += $orders->count();

                $priorOrders = DB::table('Order')
                    ->where('customerId', $log->customerId)
                    ->where('status', 'COMPLETED')
                    ->where('createdAt', '<', date('Y-m-d H:i:s', $sentTime))
                    ->count();

                if ($priorOrders === 0) {
                    $firstTimeCustomerAttributions += $orders->count();
                } else {
                    $repeatCustomerAttributions += $orders->count();
                }

                foreach ($orders as $o) {
                    $bills = DB::table('Bill')
                        ->where('orderId', $o->id)
                        ->whereIn('status', ['FINALIZED', 'PAID'])
                        ->get();

                    foreach ($bills as $b) {
                        $revenueGenerated += (float)$b->grandTotal;
                        if ($campaign->couponId && ($b->appliedCouponId === $campaign->couponId)) {
                            $couponAttributions++;
                        }
                    }
                }
            }
        }

        $conversionRate = $totalAudience > 0 ? round(($convertedCustomersCount / $totalAudience) * 100, 2) : 0.0;
        $averageOrderValue = $attributedOrdersCount > 0 ? round($revenueGenerated / $attributedOrdersCount, 2) : 0.0;
        $roi = $campaignCost > 0 ? round((($revenueGenerated - $campaignCost) / $campaignCost) * 100, 2) : 0.0;

        return [
            'campaignId' => $campaign->id,
            'campaignName' => $campaign->name,
            'status' => $campaign->status,
            'type' => $campaign->type,
            'totalAudience' => $totalAudience,
            'messagesQueued' => $messagesQueued,
            'messagesSent' => $messagesSent,
            'delivered' => $delivered,
            'read' => $read,
            'failed' => $failed,
            'deliveryRate' => $deliveryRate,
            'readRate' => $readRate,
            'conversionRate' => $conversionRate,
            'revenueGenerated' => $revenueGenerated,
            'averageOrderValue' => $averageOrderValue,
            'campaignCost' => $campaignCost,
            'roi' => $roi,
            'attribution' => [
                'attributedOrdersCount' => $attributedOrdersCount,
                'couponAttributions' => $couponAttributions,
                'loyaltyAttributions' => $loyaltyAttributions,
                'repeatCustomerAttributions' => $repeatCustomerAttributions,
                'firstTimeCustomerAttributions' => $firstTimeCustomerAttributions,
            ],
        ];
    }

    public function getOverviewAnalytics(?array $filters = []): array
    {
        $query = Campaign::query();
        if (!empty($filters['type'])) $query->where('type', $filters['type']);
        if (!empty($filters['status'])) $query->where('status', $filters['status']);
        if (!empty($filters['startDate'])) $query->where('createdAt', '>=', $filters['startDate']);
        if (!empty($filters['endDate'])) $query->where('createdAt', '<=', $filters['endDate']);

        $campaigns = $query->get(['id']);

        $totalRevenue = 0.0;
        $totalCost = 0.0;
        $totalAudienceSum = 0;
        $totalSentSum = 0;
        $totalDeliveredSum = 0;
        $totalReadSum = 0;
        $totalFailedSum = 0;

        $campaignStats = [];
        foreach ($campaigns as $c) {
            $stats = $this->getCampaignAnalytics($c->id);
            $totalRevenue += $stats['revenueGenerated'];
            $totalCost += $stats['campaignCost'];
            $totalAudienceSum += $stats['totalAudience'];
            $totalSentSum += $stats['messagesSent'];
            $totalDeliveredSum += $stats['delivered'];
            $totalReadSum += $stats['read'];
            $totalFailedSum += $stats['failed'];

            $campaignStats[] = $stats;
        }

        $aggregateRoi = $totalCost > 0 ? round((($totalRevenue - $totalCost) / $totalCost) * 100, 2) : 0.0;
        $aggregateDeliveryRate = $totalSentSum > 0 ? round(($totalDeliveredSum / $totalSentSum) * 100, 2) : 0.0;
        $aggregateReadRate = $totalDeliveredSum > 0 ? round(($totalReadSum / $totalDeliveredSum) * 100, 2) : 0.0;

        $deliveryFunnel = [
            ['stage' => 'Audience', 'count' => $totalAudienceSum],
            ['stage' => 'Sent', 'count' => $totalSentSum],
            ['stage' => 'Delivered', 'count' => $totalDeliveredSum],
            ['stage' => 'Read', 'count' => $totalReadSum],
        ];

        usort($campaignStats, fn($a, $b) => $b['roi'] <=> $a['roi']);
        $topPerforming = array_slice(array_map(fn($c) => [
            'id' => $c['campaignId'],
            'name' => $c['campaignName'],
            'roi' => $c['roi'],
            'revenue' => $c['revenueGenerated'],
        ], $campaignStats), 0, 5);

        return [
            'summary' => [
                'totalCampaigns' => count($campaigns),
                'totalAudience' => $totalAudienceSum,
                'messagesSent' => $totalSentSum,
                'delivered' => $totalDeliveredSum,
                'read' => $totalReadSum,
                'failed' => $totalFailedSum,
                'totalRevenue' => $totalRevenue,
                'totalCost' => $totalCost,
                'roi' => $aggregateRoi,
                'deliveryRate' => $aggregateDeliveryRate,
                'readRate' => $aggregateReadRate,
            ],
            'deliveryFunnel' => $deliveryFunnel,
            'topPerforming' => $topPerforming,
            'recentCampaigns' => array_slice($campaignStats, 0, 5),
        ];
    }
}
