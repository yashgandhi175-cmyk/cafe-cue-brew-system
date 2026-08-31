<?php

namespace App\Services;

use App\Models\MenuItem;
use App\Models\RestaurantSettings;

class CartPricingService
{
    private function roundToTwo(float $num): float
    {
        return round($num, 2);
    }

    public function resolveAndValidateCart(array $items): array
    {
        if (empty($items)) {
            return [
                'subtotal' => 0.0,
                'validatedItems' => [],
            ];
        }

        $settings = RestaurantSettings::find('default');
        if (!$settings) {
            throw new \Exception('Restaurant configuration settings not found.', 400);
        }

        $itemIds = array_column($items, 'menuItemId');
        $menuItems = MenuItem::whereIn('id', $itemIds)
            ->with(['variants', 'menuItemAddons.addon'])
            ->get()
            ->keyBy('id');

        $calculatedSubtotal = 0.0;
        $validatedItemsList = [];

        foreach ($items as $itemDto) {
            $quantity = (int)($itemDto['quantity'] ?? 0);
            if ($quantity <= 0) {
                throw new \Exception('Quantity must be greater than zero.', 400);
            }

            $menuItemId = $itemDto['menuItemId'] ?? '';
            $menuItem = $menuItems->get($menuItemId);

            if (!$menuItem || !$menuItem->isActive || !$menuItem->available) {
                throw new \Exception("Menu item with ID \"{$menuItemId}\" is currently unavailable.", 400);
            }

            $unitPrice = (float)$menuItem->basePrice;
            $variantName = null;
            $variantPrice = null;
            $variantId = $itemDto['variantId'] ?? null;

            // Validate Variant
            $activeVariants = $menuItem->variants->where('isActive', true);
            if ($variantId) {
                $variant = $activeVariants->firstWhere('id', $variantId);
                if (!$variant) {
                    throw new \Exception("Selected variant for item \"{$menuItem->name}\" is invalid.", 400);
                }
                $unitPrice = (float)$variant->price;
                $variantName = $variant->name;
                $variantPrice = (float)$variant->price;
            } elseif ($activeVariants->count() > 0) {
                throw new \Exception("Please select a pricing variant for item \"{$menuItem->name}\".", 400);
            }

            // Validate Addons
            $addonsCost = 0.0;
            $validatedAddons = [];
            $addonIds = $itemDto['addonIds'] ?? [];

            if (!empty($addonIds)) {
                if (!$settings->allowAddons) {
                    throw new \Exception('Addons are currently disabled.', 400);
                }

                foreach ($addonIds as $addonId) {
                    $mapping = $menuItem->menuItemAddons->first(function ($ma) use ($addonId) {
                        return $ma->addonId === $addonId && $ma->addon && $ma->addon->isActive;
                    });

                    if (!$mapping) {
                        throw new \Exception("Selected addon is not mapped to item \"{$menuItem->name}\".", 400);
                    }

                    $addonPrice = (float)$mapping->addon->price;
                    $addonsCost += $addonPrice;
                    $validatedAddons[] = [
                        'addonId' => $mapping->addon->id,
                        'nameSnapshot' => $mapping->addon->name,
                        'priceSnapshot' => $addonPrice,
                    ];
                }
            }

            $itemTotal = $this->roundToTwo(($unitPrice + $addonsCost) * $quantity);
            $calculatedSubtotal += $itemTotal;

            $validatedItemsList[] = [
                'menuItemId' => $menuItem->id,
                'nameSnapshot' => $menuItem->name,
                'variantId' => $variantId,
                'variantNameSnapshot' => $variantName,
                'priceSnapshot' => (float)$menuItem->basePrice,
                'variantPriceSnapshot' => $variantPrice,
                'quantity' => $quantity,
                'addons' => $validatedAddons,
                'totalPrice' => $itemTotal,
                'notes' => $itemDto['notes'] ?? null,
            ];
        }

        return [
            'subtotal' => $this->roundToTwo($calculatedSubtotal),
            'validatedItems' => $validatedItemsList,
        ];
    }
}
