<?php

namespace App\Services;

use App\Models\MenuItem;
use App\Models\MenuVariant;
use App\Models\Addon;
use App\Models\MenuItemAddon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MenuService
{
    // ==========================================
    // ADDONS
    // ==========================================

    public function findAllAddons(bool $includeInactive = false)
    {
        $query = Addon::query();
        if (!$includeInactive) {
            $query->where('isActive', true);
        }
        return $query->orderBy('name')->get();
    }

    public function createAddon(array $data): Addon
    {
        return Addon::create([
            'id' => (string)Str::uuid(),
            'name' => trim($data['name']),
            'price' => (float)$data['price'],
            'isActive' => isset($data['isActive']) ? (bool)$data['isActive'] : true,
        ]);
    }

    public function updateAddon(string $id, array $data): Addon
    {
        $addon = Addon::find($id);
        if (!$addon) {
            throw new \Exception('Addon not found', 404);
        }

        if (isset($data['name'])) {
            $addon->name = trim($data['name']);
        }
        if (isset($data['price'])) {
            $addon->price = (float)$data['price'];
        }
        if (isset($data['isActive'])) {
            $addon->isActive = (bool)$data['isActive'];
        }

        $addon->save();
        return $addon;
    }

    public function removeAddon(string $id): array
    {
        $addon = Addon::find($id);
        if (!$addon) {
            throw new \Exception('Addon not found', 404);
        }
        $addon->delete();
        return ['message' => 'Addon deleted successfully'];
    }

    // ==========================================
    // MENU ITEMS
    // ==========================================

    public function findAllMenuItems(?string $categoryId = null, bool $includeInactive = false)
    {
        $query = MenuItem::with(['variants', 'menuItemAddons.addon', 'category']);

        if (!$includeInactive) {
            $query->where('isActive', true);
        }

        if ($categoryId) {
            $query->where('categoryId', $categoryId);
        }

        return $query->orderBy('name')->get();
    }

    public function findOneMenuItem(string $id): MenuItem
    {
        $item = MenuItem::with(['variants', 'menuItemAddons.addon', 'category'])->find($id);
        if (!$item) {
            throw new \Exception('Menu item not found', 404);
        }
        return $item;
    }

    public function createMenuItem(array $data): MenuItem
    {
        return DB::transaction(function () use ($data) {
            $itemId = (string)Str::uuid();
            $menuItem = MenuItem::create([
                'id' => $itemId,
                'name' => trim($data['name']),
                'categoryId' => $data['categoryId'],
                'basePrice' => (float)$data['basePrice'],
                'description' => isset($data['description']) ? trim($data['description']) : null,
                'image' => $data['image'] ?? null,
                'isVeg' => isset($data['isVeg']) ? (bool)$data['isVeg'] : true,
                'available' => isset($data['available']) ? (bool)$data['available'] : true,
                'popular' => isset($data['popular']) ? (bool)$data['popular'] : false,
                'recommended' => isset($data['recommended']) ? (bool)$data['recommended'] : false,
                'bestSeller' => isset($data['bestSeller']) ? (bool)$data['bestSeller'] : false,
                'isActive' => isset($data['isActive']) ? (bool)$data['isActive'] : true,
            ]);

            if (!empty($data['variants']) && is_array($data['variants'])) {
                foreach ($data['variants'] as $variantDto) {
                    MenuVariant::create([
                        'id' => (string)Str::uuid(),
                        'menuItemId' => $itemId,
                        'name' => trim($variantDto['name']),
                        'price' => (float)$variantDto['price'],
                        'isActive' => isset($variantDto['isActive']) ? (bool)$variantDto['isActive'] : true,
                    ]);
                }
            }

            if (!empty($data['addonIds']) && is_array($data['addonIds'])) {
                foreach ($data['addonIds'] as $addonId) {
                    MenuItemAddon::create([
                        'menuItemId' => $itemId,
                        'addonId' => $addonId,
                    ]);
                }
            }

            return $this->findOneMenuItem($itemId);
        });
    }

    public function updateMenuItem(string $id, array $data): MenuItem
    {
        return DB::transaction(function () use ($id, $data) {
            $menuItem = MenuItem::find($id);
            if (!$menuItem) {
                throw new \Exception('Menu item not found', 404);
            }

            if (isset($data['name'])) $menuItem->name = trim($data['name']);
            if (isset($data['categoryId'])) $menuItem->categoryId = $data['categoryId'];
            if (isset($data['basePrice'])) $menuItem->basePrice = (float)$data['basePrice'];
            if (array_key_exists('description', $data)) $menuItem->description = $data['description'];
            if (array_key_exists('image', $data)) $menuItem->image = $data['image'];
            if (isset($data['isVeg'])) $menuItem->isVeg = (bool)$data['isVeg'];
            if (isset($data['available'])) $menuItem->available = (bool)$data['available'];
            if (isset($data['popular'])) $menuItem->popular = (bool)$data['popular'];
            if (isset($data['recommended'])) $menuItem->recommended = (bool)$data['recommended'];
            if (isset($data['bestSeller'])) $menuItem->bestSeller = (bool)$data['bestSeller'];
            if (isset($data['isActive'])) $menuItem->isActive = (bool)$data['isActive'];

            $menuItem->save();

            if (isset($data['addonIds']) && is_array($data['addonIds'])) {
                MenuItemAddon::where('menuItemId', $id)->delete();
                foreach ($data['addonIds'] as $addonId) {
                    MenuItemAddon::create([
                        'menuItemId' => $id,
                        'addonId' => $addonId,
                    ]);
                }
            }

            return $this->findOneMenuItem($id);
        });
    }

    public function removeMenuItem(string $id): array
    {
        $menuItem = MenuItem::find($id);
        if (!$menuItem) {
            throw new \Exception('Menu item not found', 404);
        }
        $menuItem->delete();
        return ['message' => 'Menu item deleted successfully'];
    }

    public function bulkPriceUpdate(array $payload): array
    {
        $updateType = $payload['updateType']; // 'PERCENTAGE' | 'FLAT'
        $action = $payload['action']; // 'INCREASE' | 'DECREASE'
        $value = (float)$payload['value'];
        $categoryId = $payload['categoryId'] ?? null;

        return DB::transaction(function () use ($updateType, $action, $value, $categoryId) {
            $query = MenuItem::query();
            if ($categoryId) {
                $query->where('categoryId', $categoryId);
            }
            $items = $query->get();

            $updatedCount = 0;
            foreach ($items as $item) {
                $currentBasePrice = (float)$item->basePrice;
                $newBasePrice = $currentBasePrice;

                if ($updateType === 'PERCENTAGE') {
                    $delta = $currentBasePrice * ($value / 100);
                    $newBasePrice = $action === 'INCREASE' ? $currentBasePrice + $delta : max(0, $currentBasePrice - $delta);
                } else {
                    $newBasePrice = $action === 'INCREASE' ? $currentBasePrice + $value : max(0, $currentBasePrice - $value);
                }

                $item->basePrice = round($newBasePrice, 2);
                $item->save();
                $updatedCount++;

                // Update variants
                $variants = MenuVariant::where('menuItemId', $item->id)->get();
                foreach ($variants as $variant) {
                    $currentVPrice = (float)$variant->price;
                    if ($updateType === 'PERCENTAGE') {
                        $delta = $currentVPrice * ($value / 100);
                        $newVPrice = $action === 'INCREASE' ? $currentVPrice + $delta : max(0, $currentVPrice - $delta);
                    } else {
                        $newVPrice = $action === 'INCREASE' ? $currentVPrice + $value : max(0, $currentVPrice - $value);
                    }
                    $variant->price = round($newVPrice, 2);
                    $variant->save();
                }
            }

            return ['message' => "Bulk price update applied to {$updatedCount} items."];
        });
    }
}
