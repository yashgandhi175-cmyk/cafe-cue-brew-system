<?php

namespace App\Services;

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Banner;
use App\Models\RestaurantSettings;

class PublicMenuService
{
    public function getPublicSettings(): array
    {
        $settings = RestaurantSettings::find('default');
        if (!$settings) {
            throw new \Exception('Settings not found', 404);
        }

        return [
            'id' => $settings->id,
            'restaurantName' => $settings->restaurantName,
            'address' => $settings->address,
            'phone' => $settings->phone,
            'gstin' => $settings->gstin,
            'qrOrderingEnabled' => (bool)$settings->qrOrderingEnabled,
            'requireCustomerName' => (bool)$settings->requireCustomerName,
            'requireCustomerPhone' => (bool)$settings->requireCustomerPhone,
            'allowAddons' => (bool)$settings->allowAddons,
            'enableGst' => (bool)$settings->enableGst,
            'gstPercentage' => (float)$settings->gstPercentage,
            'currency' => $settings->currency ?? 'INR',
        ];
    }

    public function getPublicCategories()
    {
        return Category::where('isActive', true)
            ->orderBy('displayOrder')
            ->orderBy('name')
            ->get();
    }

    public function getPublicBanners()
    {
        $now = now();
        return Banner::where('isActive', true)
            ->where(function ($q) use ($now) {
                $q->whereNull('startDate')->orWhere('startDate', '<=', $now);
            })
            ->where(function ($q) use ($now) {
                $q->whereNull('endDate')->orWhere('endDate', '>=', $now);
            })
            ->orderBy('priority', 'desc')
            ->get();
    }

    public function getPublicMenuItems(array $filters = [])
    {
        $query = MenuItem::where('isActive', true)
            ->where('available', true)
            ->with([
                'variants' => function ($q) {
                    $q->where('isActive', true);
                },
                'menuItemAddons.addon' => function ($q) {
                    $q->where('isActive', true);
                },
                'category'
            ]);

        if (!empty($filters['categoryId'])) {
            $query->where('categoryId', $filters['categoryId']);
        }

        $items = $query->orderBy('name')->get();

        // Apply filters
        if (!empty($filters['search'])) {
            $term = mb_strtolower(trim($filters['search']));
            $items = $items->filter(function ($item) use ($term) {
                return str_contains(mb_strtolower($item->name), $term) ||
                    ($item->description && str_contains(mb_strtolower($item->description), $term));
            });
        }

        if (isset($filters['veg']) && $filters['veg'] === 'true') {
            $items = $items->filter(fn($i) => (bool)$i->isVeg);
        }

        if (isset($filters['popular']) && $filters['popular'] === 'true') {
            $items = $items->filter(fn($i) => (bool)$i->popular);
        }

        if (isset($filters['bestSeller']) && $filters['bestSeller'] === 'true') {
            $items = $items->filter(fn($i) => (bool)$i->bestSeller);
        }

        return array_values($items->all());
    }
}
