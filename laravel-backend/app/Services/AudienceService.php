<?php

namespace App\Services;

use App\Models\Customer;
use Illuminate\Database\Eloquent\Builder;

class AudienceService
{
    public function applySegmentRuleGroup(Builder $query, ?array $ruleGroup): Builder
    {
        $query->where('status', 'ACTIVE')
              ->where('marketingConsent', true);

        if (empty($ruleGroup) || empty($ruleGroup['rules'])) {
            return $query;
        }

        $conjunction = strtoupper($ruleGroup['conjunction'] ?? 'AND');
        $rules = $ruleGroup['rules'];

        if ($conjunction === 'OR') {
            $query->where(function ($subQuery) use ($rules) {
                foreach ($rules as $rule) {
                    $subQuery->orWhere(function ($q) use ($rule) {
                        $this->applyRule($q, $rule);
                    });
                }
            });
        } else {
            $query->where(function ($subQuery) use ($rules) {
                foreach ($rules as $rule) {
                    $subQuery->where(function ($q) use ($rule) {
                        $this->applyRule($q, $rule);
                    });
                }
            });
        }

        return $query;
    }

    private function applyRule(Builder $query, array $rule): void
    {
        if (!empty($rule['conjunction'])) {
            $this->applySegmentRuleGroup($query, $rule);
            return;
        }

        $field = $rule['field'] ?? null;
        $operator = strtoupper($rule['operator'] ?? 'EQUALS');
        $value = $rule['value'] ?? null;

        if (!$field) return;

        switch ($field) {
            case 'tags':
                $tags = is_array($value) ? $value : [$value];
                if ($operator === 'EQUALS' || $operator === 'IN') {
                    $query->whereHas('tagAssignments.tag', function ($q) use ($tags) {
                        $q->whereIn('name', $tags);
                    });
                } elseif ($operator === 'NOT_EQUALS' || $operator === 'NOT_IN') {
                    $query->whereDoesntHave('tagAssignments.tag', function ($q) use ($tags) {
                        $q->whereIn('name', $tags);
                    });
                }
                break;

            case 'loyaltyTier':
                $tier = strtoupper((string)$value);
                $minPoints = 0; $maxPoints = 999999;
                if ($tier === 'BRONZE') { $maxPoints = 99; }
                elseif ($tier === 'SILVER') { $minPoints = 100; $maxPoints = 499; }
                elseif ($tier === 'GOLD') { $minPoints = 500; $maxPoints = 999; }
                elseif ($tier === 'PLATINUM') { $minPoints = 1000; }

                $query->whereBetween('loyaltyPoints', [$minPoints, $maxPoints]);
                break;

            case 'totalSpend':
                $spendVal = (float)$value;
                if ($operator === 'GREATER_THAN') {
                    $query->where('totalSpending', '>', $spendVal);
                } elseif ($operator === 'LESS_THAN') {
                    $query->where('totalSpending', '<', $spendVal);
                } else {
                    $query->where('totalSpending', '>=', $spendVal);
                }
                break;

            case 'totalOrders':
                $query->whereHas('orders', function ($q) {
                    $q->where('status', 'COMPLETED');
                });
                break;

            case 'lastVisitDays':
                $days = (int)$value;
                $cutoff = date('Y-m-d H:i:s', time() - ($days * 86400));
                if ($operator === 'GREATER_THAN') {
                    $query->whereDoesntHave('orders', function ($q) use ($cutoff) {
                        $q->where('status', 'COMPLETED')
                          ->where('createdAt', '>=', $cutoff);
                    });
                } else {
                    $query->whereHas('orders', function ($q) use ($cutoff) {
                        $q->where('status', 'COMPLETED')
                          ->where('createdAt', '>=', $cutoff);
                    });
                }
                break;

            case 'phoneExists':
                $query->whereNotNull('phone')->where('phone', '!=', '');
                break;

            case 'whatsappConsent':
            case 'marketingConsent':
                $query->where('marketingConsent', filter_var($value, FILTER_VALIDATE_BOOLEAN));
                break;
        }
    }
}
