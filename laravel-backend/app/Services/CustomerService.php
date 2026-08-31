<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerTag;
use App\Models\CustomerTagAssignment;
use App\Models\Staff;
use App\Models\RestaurantSettings;
use App\Models\Order;
use App\Models\Bill;
use App\Models\AuditLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CustomerService
{
    public function checkPermission(string $userId, string $capability): void
    {
        $staff = Staff::find($userId);
        if (!$staff) {
            throw new \Exception('Staff member not found.', 401);
        }
        if ($staff->role === 'OWNER') {
            return;
        }
        if ($capability === 'ownerOnly') {
            throw new \Exception('Only the OWNER can perform this action.', 403);
        }
        if ($staff->role === 'MANAGER' || $staff->role === 'CASHIER') {
            $settings = RestaurantSettings::find('default');
            if ($settings && !empty($settings->$capability)) {
                return;
            }
        }
        throw new \Exception('You do not have permission to perform this action.', 403);
    }

    public function normalizePhone(string $phone): string
    {
        $cleaned = preg_replace('/[^0-9]/', '', $phone);
        if (strlen($cleaned) === 10) {
            return '+91' . $cleaned;
        }
        if (strlen($cleaned) === 12 && str_starts_with($cleaned, '91')) {
            return '+' . $cleaned;
        }
        return str_starts_with($phone, '+') ? $phone : '+' . $cleaned;
    }

    public function getCustomerMetricsAndSegments(string $customerId, ?RestaurantSettings $settings): array
    {
        $winDays = $settings ? ($settings->newCustomerWindowDays ?? 30) : 30;
        $regThresh = $settings ? ($settings->regularCustomerVisitThreshold ?? 5) : 5;
        $vipThresh = $settings ? (float)($settings->vipCustomerSpendThreshold ?? 10000) : 10000.0;
        $highSpendThresh = $settings ? (float)($settings->highSpenderAverageSpendThreshold ?? 1000) : 1000.0;
        $atRiskDays = $settings ? ($settings->atRiskDays ?? 30) : 30;
        $inactiveDays = $settings ? ($settings->inactiveDays ?? 60) : 60;

        $stats = DB::selectOne("
            SELECT
                COUNT(b.id) as billCount,
                COALESCE(SUM(b.grandTotal), 0) as totalSpend,
                COALESCE(MIN(b.createdAt), NULL) as firstVisit,
                COALESCE(MAX(b.createdAt), NULL) as lastVisit,
                COUNT(DISTINCT DATE(ADDTIME(b.createdAt, '05:30:00'))) as visits
            FROM `Bill` b
            INNER JOIN `Order` o ON b.orderId = o.id
            WHERE o.customerId = ? AND b.status IN ('FINALIZED', 'PAID')
        ", [$customerId]);

        $visits = (int)($stats->visits ?? 0);
        $totalSpend = (float)($stats->totalSpend ?? 0);
        $averageSpend = $visits > 0 ? round($totalSpend / $visits, 2) : 0.0;
        $firstVisit = $stats->firstVisit ? date('Y-m-d H:i:s', strtotime($stats->firstVisit)) : null;
        $lastVisit = $stats->lastVisit ? date('Y-m-d H:i:s', strtotime($stats->lastVisit)) : null;

        $daysSinceLastVisit = -1;
        if ($lastVisit) {
            $diffTime = abs(time() - strtotime($lastVisit));
            $daysSinceLastVisit = (int)floor($diffTime / 86400);
        }

        $isNew = ($visits === 1 && $firstVisit && floor(abs(time() - strtotime($firstVisit)) / 86400) <= $winDays);
        $isRegular = ($visits >= $regThresh);
        $isVip = ($totalSpend >= $vipThresh);
        $isHighSpender = ($averageSpend >= $highSpendThresh);
        $isAtRisk = ($visits > 0 && $daysSinceLastVisit >= $atRiskDays && $daysSinceLastVisit < $inactiveDays);
        $isInactive = ($visits > 0 && $daysSinceLastVisit >= $inactiveDays);

        $segmentFlags = [
            'NEW' => (bool)$isNew,
            'REGULAR' => (bool)$isRegular,
            'VIP' => (bool)$isVip,
            'HIGH_SPENDER' => (bool)$isHighSpender,
            'AT_RISK' => (bool)$isAtRisk,
            'INACTIVE' => (bool)$isInactive,
        ];

        $primaryLifecycleSegment = 'UNCLASSIFIED';
        if ($isInactive) $primaryLifecycleSegment = 'INACTIVE';
        elseif ($isAtRisk) $primaryLifecycleSegment = 'AT_RISK';
        elseif ($isVip) $primaryLifecycleSegment = 'VIP';
        elseif ($isRegular) $primaryLifecycleSegment = 'REGULAR';
        elseif ($isNew) $primaryLifecycleSegment = 'NEW';

        return [
            'totalSpend' => $totalSpend,
            'totalOrders' => (int)($stats->billCount ?? 0),
            'visits' => $visits,
            'averageSpend' => $averageSpend,
            'firstVisit' => $firstVisit,
            'lastVisit' => $lastVisit,
            'segmentFlags' => $segmentFlags,
            'primaryLifecycleSegment' => $primaryLifecycleSegment,
        ];
    }

    public function findAll(array $query, string $userId): array
    {
        $this->checkPermission($userId, 'managerCanViewCustomerCRM');
        $settings = RestaurantSettings::find('default');

        $page = max(1, (int)($query['page'] ?? 1));
        $limit = min(100, max(1, (int)($query['limit'] ?? 15)));
        $skip = ($page - 1) * $limit;

        $dbQuery = Customer::with('tagAssignments.tag');

        if (!empty($query['search'])) {
            $s = trim($query['search']);
            $dbQuery->where(function ($q) use ($s) {
                $q->where('name', 'LIKE', "%{$s}%")
                  ->orWhere('phone', 'LIKE', "%{$s}%");
            });
        }

        if (!empty($query['status'])) {
            $dbQuery->where('status', $query['status']);
        }

        if (isset($query['marketingConsent'])) {
            $dbQuery->where('marketingConsent', $query['marketingConsent'] === 'true');
        }

        if (!empty($query['tag'])) {
            $dbQuery->whereHas('tagAssignments', function ($q) use ($query) {
                $q->where('tagId', $query['tag']);
            });
        }

        $allCustomers = $dbQuery->get();

        $enriched = [];
        foreach ($allCustomers as $c) {
            $metrics = $this->getCustomerMetricsAndSegments($c->id, $settings);
            $arr = $c->toArray();
            $arr['metrics'] = $metrics;
            $enriched[] = $arr;
        }

        if (!empty($query['segment'])) {
            $segKey = $query['segment'];
            $enriched = array_values(array_filter($enriched, function ($c) use ($segKey) {
                return ($c['metrics']['primaryLifecycleSegment'] === $segKey || !empty($c['metrics']['segmentFlags'][$segKey]));
            }));
        }

        $sortBy = $query['sortBy'] ?? 'createdAt';
        $sortOrder = $query['sortOrder'] ?? 'desc';

        usort($enriched, function ($a, $b) use ($sortBy, $sortOrder) {
            $valA = $a[$sortBy] ?? $a['metrics'][$sortBy] ?? 0;
            $valB = $b[$sortBy] ?? $b['metrics'][$sortBy] ?? 0;

            if (is_string($valA) && strtotime($valA)) $valA = strtotime($valA);
            if (is_string($valB) && strtotime($valB)) $valB = strtotime($valB);

            if ($valA < $valB) return $sortOrder === 'asc' ? -1 : 1;
            if ($valA > $valB) return $sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        $total = count($enriched);
        $items = array_slice($enriched, $skip, $limit);

        return [
            'items' => $items,
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'totalPages' => (int)ceil($total / $limit),
            ],
        ];
    }

    public function findOne(string $id, string $userId): array
    {
        $this->checkPermission($userId, 'managerCanViewCustomerCRM');
        $customer = Customer::with('tagAssignments.tag')->find($id);
        if (!$customer) {
            throw new \Exception('Customer not found.', 404);
        }

        $settings = RestaurantSettings::find('default');
        $metrics = $this->getCustomerMetricsAndSegments($customer->id, $settings);

        $recentOrders = Order::with('bills')
            ->where('customerId', $id)
            ->orderBy('createdAt', 'desc')
            ->take(10)
            ->get()
            ->toArray();

        $res = $customer->toArray();
        $res['metrics'] = $metrics;
        $res['recentOrders'] = $recentOrders;
        return $res;
    }

    public function create(array $dto, string $userId): Customer
    {
        $this->checkPermission($userId, 'managerCanManageCustomerCRM');
        $normalizedPhone = $this->normalizePhone($dto['phone']);

        if (Customer::where('phone', $normalizedPhone)->exists()) {
            throw new \Exception('A customer with this phone number already exists.', 400);
        }

        $consent = !empty($dto['marketingConsent']);

        return Customer::create([
            'id' => (string)Str::uuid(),
            'name' => trim($dto['name']),
            'phone' => $normalizedPhone,
            'email' => !empty($dto['email']) ? trim($dto['email']) : null,
            'birthday' => !empty($dto['birthday']) ? $dto['birthday'] : null,
            'anniversary' => !empty($dto['anniversary']) ? $dto['anniversary'] : null,
            'notes' => !empty($dto['notes']) ? trim($dto['notes']) : null,
            'marketingConsent' => $consent,
            'marketingConsentAt' => $consent ? now() : null,
            'marketingConsentSource' => $consent ? 'POS_STAFF_CAPTURE' : null,
            'loyaltyPoints' => 0,
            'status' => 'ACTIVE',
        ]);
    }

    public function update(string $id, array $dto, string $userId): Customer
    {
        $this->checkPermission($userId, 'managerCanManageCustomerCRM');
        $customer = Customer::find($id);
        if (!$customer) {
            throw new \Exception('Customer not found.', 404);
        }

        if (array_key_exists('name', $dto)) $customer->name = trim($dto['name']);
        if (array_key_exists('email', $dto)) $customer->email = !empty($dto['email']) ? trim($dto['email']) : null;
        if (array_key_exists('birthday', $dto)) $customer->birthday = !empty($dto['birthday']) ? $dto['birthday'] : null;
        if (array_key_exists('anniversary', $dto)) $customer->anniversary = !empty($dto['anniversary']) ? $dto['anniversary'] : null;
        if (array_key_exists('notes', $dto)) $customer->notes = !empty($dto['notes']) ? trim($dto['notes']) : null;
        if (array_key_exists('status', $dto)) $customer->status = $dto['status'];

        $customer->save();
        return $customer;
    }

    public function updateConsent(string $id, array $dto, string $userId): Customer
    {
        $this->checkPermission($userId, 'managerCanManageCustomerCRM');
        $customer = Customer::find($id);
        if (!$customer) {
            throw new \Exception('Customer not found.', 404);
        }

        $consent = (bool)$dto['marketingConsent'];
        if ($consent && $customer->status === 'BLOCKED') {
            throw new \Exception('Cannot grant marketing consent for a blocked customer.', 400);
        }

        return DB::transaction(function () use ($id, $customer, $dto, $userId, $consent) {
            $customer->marketingConsent = $consent;
            $customer->marketingConsentAt = $consent ? now() : null;
            $customer->marketingConsentSource = $consent ? $dto['source'] : null;
            $customer->marketingOptOutAt = !$consent ? now() : null;
            $customer->save();

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $userId,
                'action' => $consent ? 'CUSTOMER_MARKETING_CONSENT_GRANTED' : 'CUSTOMER_MARKETING_CONSENT_REVOKED',
                'entityType' => 'Customer',
                'entityId' => $id,
                'newData' => json_encode($consent ? ['customerId' => $id, 'marketingConsentSource' => $dto['source']] : ['customerId' => $id]),
                'ipAddress' => '127.0.0.1',
                'createdAt' => now(),
            ]);

            return $customer;
        });
    }

    public function findAllTags(string $userId): array
    {
        $this->checkPermission($userId, 'managerCanViewCustomerCRM');
        return CustomerTag::orderBy('name', 'asc')->get()->toArray();
    }

    public function createTag(array $dto, string $userId): CustomerTag
    {
        $this->checkPermission($userId, 'ownerOnly');
        $name = trim($dto['name']);
        if (CustomerTag::where('name', $name)->exists()) {
            throw new \Exception('A tag with this name already exists.', 400);
        }

        return CustomerTag::create([
            'id' => (string)Str::uuid(),
            'name' => $name,
            'description' => $dto['description'] ?? null,
            'isActive' => true,
        ]);
    }

    public function deactivateTag(string $id, string $userId): CustomerTag
    {
        $this->checkPermission($userId, 'ownerOnly');
        $tag = CustomerTag::find($id);
        if (!$tag) {
            throw new \Exception('Tag not found.', 404);
        }
        $tag->isActive = false;
        $tag->save();
        return $tag;
    }

    public function assignTag(string $customerId, string $tagId, string $staffId): CustomerTagAssignment
    {
        $this->checkPermission($staffId, 'managerCanManageCustomerCRM');

        $customer = Customer::find($customerId);
        $tag = CustomerTag::find($tagId);
        if (!$customer) throw new \Exception('Customer not found.', 404);
        if (!$tag) throw new \Exception('Tag not found.', 404);
        if (!$tag->isActive) throw new \Exception('Cannot assign a deactivated tag.', 400);

        $existing = CustomerTagAssignment::where('customerId', $customerId)->where('tagId', $tagId)->first();
        if ($existing) return $existing;

        return DB::transaction(function () use ($customerId, $tagId, $staffId) {
            $assignment = CustomerTagAssignment::create([
                'customerId' => $customerId,
                'tagId' => $tagId,
                'assignedById' => $staffId,
                'assignedAt' => now(),
            ]);

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staffId,
                'action' => 'CUSTOMER_TAG_ASSIGNED',
                'entityType' => 'Customer',
                'entityId' => $customerId,
                'newData' => json_encode(['customerId' => $customerId, 'tagId' => $tagId]),
                'ipAddress' => '127.0.0.1',
                'createdAt' => now(),
            ]);

            return $assignment;
        });
    }

    public function removeTagAssignment(string $customerId, string $tagId, string $staffId): array
    {
        $this->checkPermission($staffId, 'managerCanManageCustomerCRM');
        $existing = CustomerTagAssignment::where('customerId', $customerId)->where('tagId', $tagId)->first();
        if (!$existing) {
            throw new \Exception('Tag assignment not found.', 404);
        }

        return DB::transaction(function () use ($customerId, $tagId, $staffId) {
            CustomerTagAssignment::where('customerId', $customerId)->where('tagId', $tagId)->delete();

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staffId,
                'action' => 'CUSTOMER_TAG_REMOVED',
                'entityType' => 'Customer',
                'entityId' => $customerId,
                'newData' => json_encode(['customerId' => $customerId, 'tagId' => $tagId]),
                'ipAddress' => '127.0.0.1',
                'createdAt' => now(),
            ]);

            return ['success' => true];
        });
    }

    private function sanitizeCsvCell(mixed $val): string
    {
        if ($val === null || $val === '') return '';
        $str = (string)$val;
        if (str_starts_with($str, '=') || str_starts_with($str, '+') || str_starts_with($str, '-') || str_starts_with($str, '@')) {
            $str = "'" . $str;
        }
        return $str;
    }

    public function exportCsv(string $userId): string
    {
        $this->checkPermission($userId, 'ownerOnly');

        $customers = Customer::with('tagAssignments.tag')->get();
        if (count($customers) > 5000) {
            throw new \Exception('CSV export limit of 5000 records exceeded.', 400);
        }

        $settings = RestaurantSettings::find('default');

        AuditLog::create([
            'id' => (string)Str::uuid(),
            'staffId' => $userId,
            'action' => 'CRM_EXPORT',
            'entityType' => 'Customer',
            'entityId' => 'ALL',
            'newData' => json_encode(['recordCount' => count($customers)]),
            'createdAt' => now(),
        ]);

        $headers = [
            'ID', 'Name', 'Phone', 'Email', 'Birthday', 'Anniversary',
            'Marketing Consent', 'Consent Date', 'Consent Source', 'Status',
            'Total Spend', 'Total Visits', 'Average Spend', 'First Visit', 'Last Visit', 'Tags'
        ];

        $rows = [];
        foreach ($customers as $c) {
            $metrics = $this->getCustomerMetricsAndSegments($c->id, $settings);
            $tags = $c->tagAssignments->map(fn($a) => $a->tag->name ?? '')->filter()->implode(', ');

            $rows[] = [
                $c->id,
                $this->sanitizeCsvCell($c->name),
                $this->sanitizeCsvCell($c->phone),
                $this->sanitizeCsvCell($c->email),
                $c->birthday ? date('Y-m-d', strtotime($c->birthday)) : '',
                $c->anniversary ? date('Y-m-d', strtotime($c->anniversary)) : '',
                $c->marketingConsent ? 'YES' : 'NO',
                $c->marketingConsentAt ? date('Y-m-d H:i:s', strtotime($c->marketingConsentAt)) : '',
                $c->marketingConsentSource ?? '',
                $c->status,
                number_format($metrics['totalSpend'], 2, '.', ''),
                $metrics['visits'],
                number_format($metrics['averageSpend'], 2, '.', ''),
                $metrics['firstVisit'] ?? '',
                $metrics['lastVisit'] ?? '',
                $this->sanitizeCsvCell($tags),
            ];
        }

        $content = [
            implode(',', array_map(fn($h) => '"' . $this->sanitizeCsvCell($h) . '"', $headers))
        ];
        foreach ($rows as $row) {
            $content[] = implode(',', array_map(fn($cell) => '"' . $this->sanitizeCsvCell($cell) . '"', $row));
        }

        return implode("
", $content);
    }

    public function getCrmAnalytics(string $userId): array
    {
        $this->checkPermission($userId, 'managerCanViewCustomerCRM');
        $settings = RestaurantSettings::find('default');
        $customers = Customer::all();

        $totalCustomers = count($customers);
        $newCount = 0; $regularCount = 0; $vipCount = 0;
        $highSpenderCount = 0; $atRiskCount = 0; $inactiveCount = 0;
        $consentCount = 0; $activeCount = 0; $returningCount = 0;
        $totalSpendOverall = 0.0; $totalVisitsOverall = 0;

        $metricsList = [];
        foreach ($customers as $c) {
            $m = $this->getCustomerMetricsAndSegments($c->id, $settings);
            $totalSpendOverall += $m['totalSpend'];
            $totalVisitsOverall += $m['visits'];

            if (!empty($m['segmentFlags']['NEW'])) $newCount++;
            if (!empty($m['segmentFlags']['REGULAR'])) $regularCount++;
            if (!empty($m['segmentFlags']['VIP'])) $vipCount++;
            if (!empty($m['segmentFlags']['HIGH_SPENDER'])) $highSpenderCount++;
            if (!empty($m['segmentFlags']['AT_RISK'])) $atRiskCount++;
            if (!empty($m['segmentFlags']['INACTIVE'])) $inactiveCount++;
            if ($m['visits'] > 1) $returningCount++;

            if ($c->marketingConsent) $consentCount++;
            if ($c->status === 'ACTIVE') $activeCount++;

            $metricsList[] = [
                'id' => $c->id,
                'name' => $c->name,
                'phone' => $c->phone,
                'totalSpend' => $m['totalSpend'],
                'visits' => $m['visits'],
            ];
        }

        $customersWithVisits = count(array_filter($metricsList, fn($x) => $x['visits'] >= 1));
        $repeatRate = $customersWithVisits > 0 ? round(($returningCount / $customersWithVisits) * 100, 2) : 0.0;
        $avgSpendOverall = $totalVisitsOverall > 0 ? round($totalSpendOverall / $totalVisitsOverall, 2) : 0.0;

        usort($metricsList, fn($a, $b) => $b['totalSpend'] <=> $a['totalSpend']);
        $topCustomers = array_slice($metricsList, 0, 10);

        return [
            'totalCustomers' => $totalCustomers,
            'newCustomers' => $newCount,
            'returningCustomers' => $returningCount,
            'repeatCustomerRate' => $repeatRate,
            'totalEligibleCustomerSpend' => $totalSpendOverall,
            'averageSpendPerVisit' => $avgSpendOverall,
            'activeCustomerCount' => $activeCount,
            'inactiveCustomerCount' => $inactiveCount,
            'atRiskCustomerCount' => $atRiskCount,
            'vipCustomerCount' => $vipCount,
            'highSpenderCustomerCount' => $highSpenderCount,
            'marketingConsentCount' => $consentCount,
            'topCustomers' => $topCustomers,
            'segmentCounts' => [
                'NEW' => $newCount,
                'REGULAR' => $regularCount,
                'VIP' => $vipCount,
                'HIGH_SPENDER' => $highSpenderCount,
                'AT_RISK' => $atRiskCount,
                'INACTIVE' => $inactiveCount,
            ],
        ];
    }
}
