<?php

namespace App\Services;

use App\Models\Ingredient;
use App\Models\Recipe;
use App\Models\Supplier;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\WastageEntry;
use App\Models\StockTransaction;
use App\Models\Staff;
use App\Models\RestaurantSettings;
use App\Models\Bill;
use App\Models\Expense;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class InventoryService
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
        if ($staff->role === 'MANAGER') {
            $settings = RestaurantSettings::find('default');
            if ($settings && !empty($settings->$capability)) {
                return;
            }
        }
        throw new \Exception('You do not have permission to perform this action.', 403);
    }

    // ==========================================
    // INGREDIENTS
    // ==========================================

    public function createIngredient(array $dto, string $userId): Ingredient
    {
        $this->checkPermission($userId, 'managerCanManageInventory');

        $name = trim($dto['name']);
        if (Ingredient::where('name', $name)->exists()) {
            throw new \Exception("Ingredient with name \"{$name}\" already exists.", 400);
        }

        if (!empty($dto['sku'])) {
            $sku = trim($dto['sku']);
            if (Ingredient::where('sku', $sku)->exists()) {
                throw new \Exception("Ingredient with SKU \"{$sku}\" already exists.", 400);
            }
        }

        return DB::transaction(function () use ($dto, $userId, $name) {
            $ingredient = Ingredient::create([
                'id' => (string)Str::uuid(),
                'name' => $name,
                'sku' => $dto['sku'] ?? null,
                'unit' => $dto['unit'],
                'category' => $dto['category'] ?? 'OTHER',
                'minimumStock' => (float)($dto['minimumStock'] ?? 0),
                'reorderLevel' => (float)($dto['reorderLevel'] ?? 0),
                'preferredSupplierId' => $dto['preferredSupplierId'] ?? null,
                'currentStock' => 0,
                'averageCost' => 0,
                'lastPurchaseCost' => 0,
                'isActive' => true,
            ]);

            StockTransaction::create([
                'id' => (string)Str::uuid(),
                'ingredientId' => $ingredient->id,
                'type' => 'OPENING_STOCK',
                'quantityChange' => 0,
                'unitCostSnapshot' => 0,
                'totalCostSnapshot' => 0,
                'balanceBefore' => 0,
                'balanceAfter' => 0,
                'averageCostBefore' => 0,
                'averageCostAfter' => 0,
                'notes' => 'Initial setup of ingredient.',
                'changedById' => $userId,
                'createdAt' => now(),
            ]);

            return $ingredient;
        });
    }

    public function findAllIngredients(string $userId, ?bool $active = null): array
    {
        $query = Ingredient::with('preferredSupplier')->orderBy('name', 'asc');
        if ($active !== null) {
            $query->active($active);
        }
        $list = $query->get();

        $hasCostPermission = true;
        try {
            $this->checkPermission($userId, 'managerCanViewInventoryCost');
        } catch (\Exception $e) {
            $hasCostPermission = false;
        }

        if (!$hasCostPermission) {
            return $list->map(function ($ing) {
                $arr = $ing->toArray();
                unset($arr['averageCost'], $arr['lastPurchaseCost']);
                return $arr;
            })->toArray();
        }

        return $list->toArray();
    }

    public function findOneIngredient(string $id, string $userId): Ingredient
    {
        $ingredient = Ingredient::with('preferredSupplier')->find($id);
        if (!$ingredient) {
            throw new \Exception('Ingredient not found.', 404);
        }

        try {
            $this->checkPermission($userId, 'managerCanViewInventoryCost');
        } catch (\Exception $e) {
            $ingredient->makeHidden(['averageCost', 'lastPurchaseCost']);
        }

        return $ingredient;
    }

    public function updateIngredient(string $id, array $dto, string $userId): Ingredient
    {
        $this->checkPermission($userId, 'managerCanManageInventory');
        $ingredient = Ingredient::find($id);
        if (!$ingredient) {
            throw new \Exception('Ingredient not found.', 404);
        }

        if (!empty($dto['name']) && $dto['name'] !== $ingredient->name) {
            if (Ingredient::where('name', $dto['name'])->where('id', '!=', $id)->exists()) {
                throw new \Exception("Ingredient with name \"{$dto['name']}\" already exists.", 400);
            }
            $ingredient->name = trim($dto['name']);
        }

        if (!empty($dto['sku']) && $dto['sku'] !== $ingredient->sku) {
            if (Ingredient::where('sku', $dto['sku'])->where('id', '!=', $id)->exists()) {
                throw new \Exception("Ingredient with SKU \"{$dto['sku']}\" already exists.", 400);
            }
            $ingredient->sku = trim($dto['sku']);
        }

        if (isset($dto['unit'])) $ingredient->unit = $dto['unit'];
        if (isset($dto['category'])) $ingredient->category = $dto['category'];
        if (isset($dto['minimumStock'])) $ingredient->minimumStock = (float)$dto['minimumStock'];
        if (isset($dto['reorderLevel'])) $ingredient->reorderLevel = (float)$dto['reorderLevel'];
        if (array_key_exists('preferredSupplierId', $dto)) $ingredient->preferredSupplierId = $dto['preferredSupplierId'];

        $ingredient->save();
        return $ingredient;
    }

    public function deleteIngredient(string $id, string $userId): bool
    {
        $this->checkPermission($userId, 'managerCanManageInventory');
        $ingredient = Ingredient::find($id);
        if (!$ingredient) {
            throw new \Exception('Ingredient not found.', 404);
        }

        if (Recipe::where('ingredientId', $id)->exists()) {
            throw new \Exception('Cannot delete ingredient linked to menu/variant/addon recipes.', 400);
        }

        if (PurchaseItem::where('ingredientId', $id)->exists()) {
            throw new \Exception('Cannot delete ingredient with existing purchase order history.', 400);
        }

        if (WastageEntry::where('ingredientId', $id)->exists()) {
            throw new \Exception('Cannot delete ingredient with existing wastage records.', 400);
        }

        if (StockTransaction::where('ingredientId', $id)->where('type', '!=', 'OPENING_STOCK')->exists()) {
            throw new \Exception('Cannot delete ingredient with existing stock transaction history.', 400);
        }

        StockTransaction::where('ingredientId', $id)->where('type', 'OPENING_STOCK')->delete();

        return (bool)$ingredient->delete();
    }

    // ==========================================
    // RECIPES
    // ==========================================

    private function validateRecipeOwnership(array $dto): void
    {
        $ownerCount = 0;
        if (!empty($dto['menuItemId'])) $ownerCount++;
        if (!empty($dto['variantId'])) $ownerCount++;
        if (!empty($dto['addonId'])) $ownerCount++;

        if ($ownerCount !== 1) {
            throw new \Exception('Recipe ownership check failed: Recipe must belong to exactly one entity (menuItemId, variantId, or addonId).', 400);
        }
    }

    public function createRecipe(array $dto, string $userId): Recipe
    {
        $this->checkPermission($userId, 'managerCanManageInventory');
        $this->validateRecipeOwnership($dto);

        $ingredient = Ingredient::find($dto['ingredientId'] ?? '');
        if (!$ingredient) {
            throw new \Exception('Ingredient not found.', 404);
        }

        $query = Recipe::where('ingredientId', $dto['ingredientId']);
        if (!empty($dto['menuItemId'])) $query->where('menuItemId', $dto['menuItemId']);
        elseif (!empty($dto['variantId'])) $query->where('variantId', $dto['variantId']);
        elseif (!empty($dto['addonId'])) $query->where('addonId', $dto['addonId']);

        if ($query->exists()) {
            throw new \Exception('Recipe already exists for this item and ingredient.', 400);
        }

        return Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $dto['menuItemId'] ?? null,
            'variantId' => $dto['variantId'] ?? null,
            'addonId' => $dto['addonId'] ?? null,
            'ingredientId' => $dto['ingredientId'],
            'quantity' => (float)$dto['quantity'],
        ]);
    }

    public function findAllRecipes(string $userId): array
    {
        return Recipe::with(['ingredient', 'menuItem', 'variant', 'addon'])->get()->toArray();
    }

    public function findOneRecipe(string $id, string $userId): Recipe
    {
        $recipe = Recipe::with(['ingredient', 'menuItem', 'variant', 'addon'])->find($id);
        if (!$recipe) {
            throw new \Exception('Recipe not found.', 404);
        }
        return $recipe;
    }

    public function updateRecipe(string $id, array $dto, string $userId): Recipe
    {
        $this->checkPermission($userId, 'managerCanManageInventory');
        $recipe = Recipe::find($id);
        if (!$recipe) {
            throw new \Exception('Recipe not found.', 404);
        }

        $checkDto = [
            'menuItemId' => array_key_exists('menuItemId', $dto) ? $dto['menuItemId'] : $recipe->menuItemId,
            'variantId' => array_key_exists('variantId', $dto) ? $dto['variantId'] : $recipe->variantId,
            'addonId' => array_key_exists('addonId', $dto) ? $dto['addonId'] : $recipe->addonId,
        ];
        $this->validateRecipeOwnership($checkDto);

        if (array_key_exists('menuItemId', $dto)) $recipe->menuItemId = $dto['menuItemId'];
        if (array_key_exists('variantId', $dto)) $recipe->variantId = $dto['variantId'];
        if (array_key_exists('addonId', $dto)) $recipe->addonId = $dto['addonId'];
        if (isset($dto['ingredientId'])) $recipe->ingredientId = $dto['ingredientId'];
        if (isset($dto['quantity'])) $recipe->quantity = (float)$dto['quantity'];

        $recipe->save();
        return $recipe;
    }

    public function deleteRecipe(string $id, string $userId): bool
    {
        $this->checkPermission($userId, 'managerCanManageInventory');
        $recipe = Recipe::find($id);
        if (!$recipe) {
            throw new \Exception('Recipe not found.', 404);
        }
        return (bool)$recipe->delete();
    }

    // ==========================================
    // SUPPLIERS
    // ==========================================

    public function createSupplier(array $dto, string $userId): Supplier
    {
        $this->checkPermission($userId, 'managerCanManageInventory');
        return Supplier::create([
            'id' => (string)Str::uuid(),
            'name' => $dto['name'],
            'contactPerson' => $dto['contactPerson'] ?? null,
            'phone' => $dto['phone'],
            'email' => $dto['email'] ?? null,
            'gstin' => $dto['gstin'] ?? null,
            'address' => $dto['address'] ?? null,
            'notes' => $dto['notes'] ?? null,
        ]);
    }

    public function findAllSuppliers(string $userId): array
    {
        return Supplier::all()->toArray();
    }

    public function findOneSupplier(string $id, string $userId): Supplier
    {
        $supplier = Supplier::find($id);
        if (!$supplier) {
            throw new \Exception('Supplier not found.', 404);
        }
        return $supplier;
    }

    public function updateSupplier(string $id, array $dto, string $userId): Supplier
    {
        $this->checkPermission($userId, 'managerCanManageInventory');
        $supplier = Supplier::find($id);
        if (!$supplier) {
            throw new \Exception('Supplier not found.', 404);
        }

        if (isset($dto['name'])) $supplier->name = $dto['name'];
        if (array_key_exists('contactPerson', $dto)) $supplier->contactPerson = $dto['contactPerson'];
        if (isset($dto['phone'])) $supplier->phone = $dto['phone'];
        if (array_key_exists('email', $dto)) $supplier->email = $dto['email'];
        if (array_key_exists('gstin', $dto)) $supplier->gstin = $dto['gstin'];
        if (array_key_exists('address', $dto)) $supplier->address = $dto['address'];
        if (array_key_exists('notes', $dto)) $supplier->notes = $dto['notes'];

        $supplier->save();
        return $supplier;
    }

    public function deleteSupplier(string $id, string $userId): bool
    {
        $this->checkPermission($userId, 'managerCanManageInventory');
        $supplier = Supplier::find($id);
        if (!$supplier) {
            throw new \Exception('Supplier not found.', 404);
        }

        if (Purchase::where('supplierId', $id)->exists()) {
            throw new \Exception('Cannot delete supplier with existing purchase order history.', 400);
        }

        if (Ingredient::where('preferredSupplierId', $id)->exists()) {
            throw new \Exception('Cannot delete supplier set as preferred supplier for ingredients.', 400);
        }

        return (bool)$supplier->delete();
    }

    // ==========================================
    // PURCHASES & FINALIZATION & REVERSALS
    // ==========================================

    public function createPurchase(array $dto, string $userId): Purchase
    {
        $this->checkPermission($userId, 'managerCanManageInventory');

        $supplier = Supplier::find($dto['supplierId']);
        if (!$supplier) {
            throw new \Exception('Supplier not found.', 404);
        }

        $purchaseNumber = 'PUR-' . date('Ymd') . '-' . rand(1000, 9999);
        if (Purchase::where('purchaseNumber', $purchaseNumber)->exists()) {
            throw new \Exception('Unique purchase number conflict. Try again.', 400);
        }

        $itemsList = $dto['items'] ?? [];
        $ingIds = array_map(fn($it) => $it['ingredientId'], $itemsList);
        $ingredients = Ingredient::whereIn('id', $ingIds)->get()->keyBy('id');

        if (count($ingredients) !== count(array_unique($ingIds))) {
            throw new \Exception('Some ingredients in the purchase items do not exist.', 400);
        }

        $calculatedSubtotal = 0.0;
        $validatedItems = [];

        foreach ($itemsList as $item) {
            $ing = $ingredients->get($item['ingredientId']);
            $qty = (float)$item['purchaseQuantity'];
            $cost = (float)$item['unitPurchaseCost'];
            $tax = (float)($item['tax'] ?? 0);
            $lineTotal = ($qty * $cost) + $tax;
            $calculatedSubtotal += $lineTotal;

            $conv = (float)$item['conversionFactor'];
            $baseQtyAdded = $qty * $conv;

            $validatedItems[] = [
                'id' => (string)Str::uuid(),
                'ingredientId' => $item['ingredientId'],
                'ingredientNameSnapshot' => $ing->name,
                'purchaseUnit' => $item['purchaseUnit'],
                'purchaseQuantity' => $qty,
                'conversionFactor' => $conv,
                'baseQuantityAdded' => $baseQtyAdded,
                'unitPurchaseCost' => $cost,
                'baseUnitCostSnapshot' => 0.0,
                'tax' => $tax,
                'lineTotal' => $lineTotal,
            ];
        }

        $discount = (float)($dto['discount'] ?? 0);
        $tax = (float)($dto['tax'] ?? 0);
        $otherCharges = (float)($dto['otherCharges'] ?? 0);
        $grandTotal = $calculatedSubtotal - $discount + $tax + $otherCharges;

        return DB::transaction(function () use ($dto, $userId, $purchaseNumber, $calculatedSubtotal, $discount, $tax, $otherCharges, $grandTotal, $validatedItems) {
            $purchase = Purchase::create([
                'id' => (string)Str::uuid(),
                'purchaseNumber' => $purchaseNumber,
                'supplierId' => $dto['supplierId'],
                'invoiceNumber' => $dto['invoiceNumber'] ?? null,
                'invoiceDate' => !empty($dto['invoiceDate']) ? $dto['invoiceDate'] : null,
                'purchaseDate' => !empty($dto['purchaseDate']) ? $dto['purchaseDate'] : now(),
                'status' => 'DRAFT',
                'subtotal' => $calculatedSubtotal,
                'discount' => $discount,
                'tax' => $tax,
                'otherCharges' => $otherCharges,
                'grandTotal' => $grandTotal,
                'notes' => $dto['notes'] ?? null,
                'createdById' => $userId,
                'createdAt' => now(),
            ]);

            foreach ($validatedItems as $valItem) {
                $valItem['purchaseId'] = $purchase->id;
                PurchaseItem::create($valItem);
            }

            return $purchase->load('items');
        });
    }

    public function findAllPurchases(string $userId): array
    {
        return Purchase::with(['supplier', 'items', 'createdBy'])->orderBy('createdAt', 'desc')->get()->toArray();
    }

    public function findOnePurchase(string $id, string $userId): Purchase
    {
        $purchase = Purchase::with(['supplier', 'createdBy', 'items'])->find($id);
        if (!$purchase) {
            throw new \Exception('Purchase not found.', 404);
        }
        return $purchase;
    }

    public function updatePurchase(string $id, array $dto, string $userId): Purchase
    {
        $this->checkPermission($userId, 'managerCanManageInventory');
        $purchase = Purchase::find($id);
        if (!$purchase) {
            throw new \Exception('Purchase not found.', 404);
        }
        if ($purchase->status !== 'DRAFT') {
            throw new \Exception('Only DRAFT purchases can be updated.', 400);
        }

        $supplierId = $dto['supplierId'] ?? $purchase->supplierId;
        if (!Supplier::where('id', $supplierId)->exists()) {
            throw new \Exception('Supplier not found.', 404);
        }

        return DB::transaction(function () use ($id, $dto, $purchase, $supplierId) {
            if (!empty($dto['items'])) {
                PurchaseItem::where('purchaseId', $id)->delete();

                $itemsList = $dto['items'];
                $ingIds = array_map(fn($it) => $it['ingredientId'], $itemsList);
                $ingredients = Ingredient::whereIn('id', $ingIds)->get()->keyBy('id');

                $calculatedSubtotal = 0.0;
                foreach ($itemsList as $item) {
                    $ing = $ingredients->get($item['ingredientId']);
                    if (!$ing) throw new \Exception("Ingredient {$item['ingredientId']} not found.", 404);

                    $qty = (float)$item['purchaseQuantity'];
                    $cost = (float)$item['unitPurchaseCost'];
                    $itemTax = (float)($item['tax'] ?? 0);
                    $lineTotal = ($qty * $cost) + $itemTax;
                    $calculatedSubtotal += $lineTotal;

                    $conv = (float)$item['conversionFactor'];
                    $baseQtyAdded = $qty * $conv;

                    PurchaseItem::create([
                        'id' => (string)Str::uuid(),
                        'purchaseId' => $id,
                        'ingredientId' => $item['ingredientId'],
                        'ingredientNameSnapshot' => $ing->name,
                        'purchaseUnit' => $item['purchaseUnit'],
                        'purchaseQuantity' => $qty,
                        'conversionFactor' => $conv,
                        'baseQuantityAdded' => $baseQtyAdded,
                        'unitPurchaseCost' => $cost,
                        'baseUnitCostSnapshot' => 0.0,
                        'tax' => $itemTax,
                        'lineTotal' => $lineTotal,
                    ]);
                }
            } else {
                $calculatedSubtotal = (float)$purchase->subtotal;
            }

            $discount = isset($dto['discount']) ? (float)$dto['discount'] : (float)$purchase->discount;
            $tax = isset($dto['tax']) ? (float)$dto['tax'] : (float)$purchase->tax;
            $otherCharges = isset($dto['otherCharges']) ? (float)$dto['otherCharges'] : (float)$purchase->otherCharges;
            $grandTotal = $calculatedSubtotal - $discount + $tax + $otherCharges;

            $purchase->supplierId = $supplierId;
            if (array_key_exists('invoiceNumber', $dto)) $purchase->invoiceNumber = $dto['invoiceNumber'];
            if (!empty($dto['invoiceDate'])) $purchase->invoiceDate = $dto['invoiceDate'];
            if (!empty($dto['purchaseDate'])) $purchase->purchaseDate = $dto['purchaseDate'];
            $purchase->subtotal = $calculatedSubtotal;
            $purchase->discount = $discount;
            $purchase->tax = $tax;
            $purchase->otherCharges = $otherCharges;
            $purchase->grandTotal = $grandTotal;
            if (array_key_exists('notes', $dto)) $purchase->notes = $dto['notes'];

            $purchase->save();
            return $purchase->load('items');
        });
    }

    public function deletePurchase(string $id, string $userId): bool
    {
        $this->checkPermission($userId, 'managerCanManageInventory');
        $purchase = Purchase::find($id);
        if (!$purchase) {
            throw new \Exception('Purchase not found.', 404);
        }
        if ($purchase->status !== 'DRAFT') {
            throw new \Exception('Only DRAFT purchases can be deleted.', 400);
        }
        PurchaseItem::where('purchaseId', $id)->delete();
        return (bool)$purchase->delete();
    }

    public function finalizePurchase(string $id, string $userId): Purchase
    {
        $this->checkPermission($userId, 'managerCanManageInventory');

        return DB::transaction(function () use ($id, $userId) {
            $purchase = Purchase::with('items')->find($id);
            if (!$purchase) throw new \Exception('Purchase not found.', 404);
            if ($purchase->status !== 'DRAFT') {
                throw new \Exception('Only DRAFT purchases can be finalized.', 400);
            }
            if ($purchase->items->count() === 0) {
                throw new \Exception('Purchase must contain at least one item.', 400);
            }

            $totalDiscount = (float)$purchase->discount;
            $totalOtherCharges = (float)$purchase->otherCharges;

            $sumRawCost = 0.0;
            foreach ($purchase->items as $item) {
                $sumRawCost += (float)$item->purchaseQuantity * (float)$item->unitPurchaseCost;
            }

            $allocatedDiscountSum = 0.0;
            $allocatedOtherChargesSum = 0.0;
            $landedCosts = [];
            $itemsCount = $purchase->items->count();

            foreach ($purchase->items as $i => $item) {
                $rawCost = (float)$item->purchaseQuantity * (float)$item->unitPurchaseCost;
                $itemDiscount = 0.0;
                $itemOtherCharges = 0.0;

                if ($sumRawCost > 0) {
                    if ($i === $itemsCount - 1) {
                        $itemDiscount = $totalDiscount - $allocatedDiscountSum;
                        $itemOtherCharges = $totalOtherCharges - $allocatedOtherChargesSum;
                    } else {
                        $ratio = $rawCost / $sumRawCost;
                        $itemDiscount = round($totalDiscount * $ratio, 4);
                        $itemOtherCharges = round($totalOtherCharges * $ratio, 4);

                        $allocatedDiscountSum += $itemDiscount;
                        $allocatedOtherChargesSum += $itemOtherCharges;
                    }
                }

                $itemTax = (float)$item->tax;
                $landedCost = $rawCost - $itemDiscount + $itemTax + $itemOtherCharges;
                $landedCosts[] = $landedCost;
            }

            // Lock ingredients for update
            $ingIds = $purchase->items->pluck('ingredientId')->toArray();
            $ingredientsMap = Ingredient::whereIn('id', $ingIds)->lockForUpdate()->get()->keyBy('id');

            foreach ($purchase->items as $i => $item) {
                $finalLandedCost = $landedCosts[$i];
                $baseQty = (float)$item->baseQuantityAdded;

                if ($baseQty <= 0) {
                    throw new \Exception("Base quantity for item \"{$item->ingredientNameSnapshot}\" must be greater than 0.", 400);
                }

                $baseUnitCost = $finalLandedCost / $baseQty;
                $item->baseUnitCostSnapshot = $baseUnitCost;
                $item->save();

                $ing = $ingredientsMap->get($item->ingredientId);
                $currentStock = (float)$ing->currentStock;
                $averageCost = (float)$ing->averageCost;

                $newAverageCost = $baseUnitCost;
                if ($currentStock > 0 && ($currentStock + $baseQty) > 0) {
                    $newAverageCost = round((($currentStock * $averageCost) + ($baseQty * $baseUnitCost)) / ($currentStock + $baseQty), 2);
                }

                $newStock = $currentStock + $baseQty;

                StockTransaction::create([
                    'id' => (string)Str::uuid(),
                    'ingredientId' => $item->ingredientId,
                    'type' => 'PURCHASE',
                    'quantityChange' => $baseQty,
                    'unitCostSnapshot' => $baseUnitCost,
                    'totalCostSnapshot' => $finalLandedCost,
                    'balanceBefore' => $currentStock,
                    'balanceAfter' => $newStock,
                    'averageCostBefore' => $averageCost,
                    'averageCostAfter' => $newAverageCost,
                    'referenceType' => 'PURCHASE',
                    'referenceId' => $purchase->id,
                    'notes' => "Purchase finalized: {$purchase->purchaseNumber}",
                    'changedById' => $userId,
                    'createdAt' => now(),
                ]);

                $ing->currentStock = $newStock;
                $ing->averageCost = $newAverageCost;
                $ing->lastPurchaseCost = $baseUnitCost;
                $ing->save();
            }

            $purchase->status = 'FINALIZED';
            $purchase->save();
            return $purchase->load('items');
        });
    }

    public function reversePurchase(string $id, string $userId): Purchase
    {
        $this->checkPermission($userId, 'managerCanManageInventory');

        return DB::transaction(function () use ($id, $userId) {
            $purchase = Purchase::with('items.ingredient')->find($id);
            if (!$purchase) throw new \Exception('Purchase not found.', 404);
            if ($purchase->status !== 'FINALIZED') {
                throw new \Exception('Only FINALIZED purchases can be reversed.', 400);
            }

            $purchaseTxs = StockTransaction::where('referenceType', 'PURCHASE')
                ->where('referenceId', $purchase->id)
                ->where('type', 'PURCHASE')
                ->get()
                ->keyBy('ingredientId');

            // Chronology check
            foreach ($purchase->items as $item) {
                $originalTx = $purchaseTxs->get($item->ingredientId);
                if (!$originalTx) {
                    throw new \Exception("Original stock transaction not found for ingredient \"{$item->ingredient->name}\". Cannot reverse.", 400);
                }

                $laterTx = StockTransaction::where('ingredientId', $item->ingredientId)
                    ->where('createdAt', '>', $originalTx->createdAt)
                    ->where(function ($q) use ($purchase) {
                        $q->where('referenceType', '!=', 'PURCHASE')
                          ->orWhere('referenceId', '!=', $purchase->id);
                    })
                    ->first();

                if ($laterTx) {
                    throw new \Exception("Reversal blocked: later stock-affecting transaction exists for ingredient \"{$item->ingredient->name}\".", 400);
                }
            }

            $ingIds = $purchase->items->pluck('ingredientId')->toArray();
            $ingredientsMap = Ingredient::whereIn('id', $ingIds)->lockForUpdate()->get()->keyBy('id');

            foreach ($purchase->items as $item) {
                $originalTx = $purchaseTxs->get($item->ingredientId);
                $ing = $ingredientsMap->get($item->ingredientId);

                $currentStock = (float)$ing->currentStock;
                $currentAverageCost = (float)$ing->averageCost;

                $restoredStock = (float)$originalTx->balanceBefore;
                $restoredAverageCost = (float)$originalTx->averageCostBefore;

                $qtyChange = -((float)$item->baseQuantityAdded);
                $baseUnitCost = (float)$originalTx->unitCostSnapshot;
                $finalLandedCost = (float)$originalTx->totalCostSnapshot;

                StockTransaction::create([
                    'id' => (string)Str::uuid(),
                    'ingredientId' => $item->ingredientId,
                    'type' => 'PURCHASE_REVERSAL',
                    'quantityChange' => $qtyChange,
                    'unitCostSnapshot' => $baseUnitCost,
                    'totalCostSnapshot' => -$finalLandedCost,
                    'balanceBefore' => $currentStock,
                    'balanceAfter' => $restoredStock,
                    'averageCostBefore' => $currentAverageCost,
                    'averageCostAfter' => $restoredAverageCost,
                    'referenceType' => 'PURCHASE',
                    'referenceId' => $purchase->id,
                    'reversesStockTransactionId' => $originalTx->id,
                    'notes' => "Purchase reversed & cancelled: {$purchase->purchaseNumber}",
                    'changedById' => $userId,
                    'createdAt' => now(),
                ]);

                $ing->currentStock = $restoredStock;
                $ing->averageCost = $restoredAverageCost;
                $ing->save();
            }

            $purchase->status = 'CANCELLED';
            $purchase->save();
            return $purchase->load('items');
        });
    }

    // ==========================================
    // WASTAGE
    // ==========================================

    public function createWastage(array $dto, string $userId): WastageEntry
    {
        $this->checkPermission($userId, 'managerCanManageInventory');

        return DB::transaction(function () use ($dto, $userId) {
            $ing = Ingredient::where('id', $dto['ingredientId'])->lockForUpdate()->first();
            if (!$ing) throw new \Exception('Ingredient not found.', 404);

            $settings = RestaurantSettings::find('default');
            $allowNegative = $settings ? (bool)$settings->allowNegativeStock : true;

            $qty = (float)$dto['quantity'];
            $balanceBefore = (float)$ing->currentStock;
            $balanceAfter = $balanceBefore - $qty;

            if (!$allowNegative && $balanceAfter < 0) {
                throw new \Exception("Insufficient stock to record wastage for ingredient: {$ing->name}", 400);
            }

            $avgCost = (float)$ing->averageCost;
            $wastageTotalCost = $qty * $avgCost;

            $wastage = WastageEntry::create([
                'id' => (string)Str::uuid(),
                'ingredientId' => $dto['ingredientId'],
                'quantity' => $qty,
                'reason' => $dto['reason'],
                'notes' => $dto['notes'] ?? null,
                'recordedById' => $userId,
                'recordedAt' => now(),
            ]);

            StockTransaction::create([
                'id' => (string)Str::uuid(),
                'ingredientId' => $dto['ingredientId'],
                'type' => 'WASTAGE',
                'quantityChange' => -$qty,
                'unitCostSnapshot' => $avgCost,
                'totalCostSnapshot' => -$wastageTotalCost,
                'balanceBefore' => $balanceBefore,
                'balanceAfter' => $balanceAfter,
                'averageCostBefore' => $avgCost,
                'averageCostAfter' => $avgCost,
                'referenceType' => 'WASTAGE',
                'referenceId' => $wastage->id,
                'notes' => "Wastage recorded: {$dto['reason']}. " . ($dto['notes'] ?? ''),
                'changedById' => $userId,
                'createdAt' => now(),
            ]);

            $ing->currentStock = $balanceAfter;
            $ing->save();

            return $wastage;
        });
    }

    public function findAllWastage(string $userId): array
    {
        return WastageEntry::with(['ingredient', 'recordedBy'])->orderBy('recordedAt', 'desc')->get()->toArray();
    }

    public function findOneWastage(string $id, string $userId): WastageEntry
    {
        $entry = WastageEntry::with(['ingredient', 'recordedBy'])->find($id);
        if (!$entry) throw new \Exception('Wastage entry not found.', 404);
        return $entry;
    }

    public function deleteWastage(string $id, string $userId): array
    {
        $this->checkPermission($userId, 'managerCanManageInventory');

        return DB::transaction(function () use ($id, $userId) {
            $entry = WastageEntry::with('ingredient')->where('id', $id)->first();
            if (!$entry) throw new \Exception('Wastage entry not found.', 404);

            $stockTx = StockTransaction::where('referenceType', 'WASTAGE')
                ->where('referenceId', $entry->id)
                ->where('type', 'WASTAGE')
                ->first();

            if (!$stockTx) {
                throw new \Exception('Original wastage stock transaction not found.', 404);
            }

            // Idempotency: Check if reversal already exists for this wastage transaction
            $alreadyReversed = StockTransaction::where('reversesStockTransactionId', $stockTx->id)->exists();
            if ($alreadyReversed) {
                throw new \Exception('Wastage entry is already reversed.', 400);
            }

            $ing = Ingredient::where('id', $entry->ingredientId)->lockForUpdate()->first();
            if (!$ing) {
                throw new \Exception('Ingredient not found.', 404);
            }

            $qtyToRestore = abs((float)$stockTx->quantityChange);
            $currentStock = (float)$ing->currentStock;
            $balanceAfter = $currentStock + $qtyToRestore;
            $avgCost = (float)$ing->averageCost;
            $totalCostSnapshot = abs((float)$stockTx->totalCostSnapshot);

            StockTransaction::create([
                'id' => (string)Str::uuid(),
                'ingredientId' => $entry->ingredientId,
                'type' => 'WASTAGE_REVERSAL',
                'quantityChange' => $qtyToRestore,
                'unitCostSnapshot' => (float)$stockTx->unitCostSnapshot,
                'totalCostSnapshot' => $totalCostSnapshot,
                'balanceBefore' => $currentStock,
                'balanceAfter' => $balanceAfter,
                'averageCostBefore' => $avgCost,
                'averageCostAfter' => $avgCost,
                'referenceType' => 'WASTAGE',
                'referenceId' => $entry->id,
                'reversesStockTransactionId' => $stockTx->id,
                'notes' => "Wastage reversed: {$entry->reason}. " . ($entry->notes ?? ''),
                'changedById' => $userId,
                'createdAt' => now(),
            ]);

            $ing->currentStock = $balanceAfter;
            $ing->save();

            $entry->delete();

            return [
                'success' => true,
                'message' => 'Wastage entry successfully reversed and removed.',
            ];
        });
    }

    // ==========================================
    // STOCK ADJUSTMENTS & RECONCILIATION
    // ==========================================

    public function adjustStock(array $dto, string $userId): StockTransaction
    {
        $this->checkPermission($userId, 'managerCanManageInventory');

        return DB::transaction(function () use ($dto, $userId) {
            $ing = Ingredient::where('id', $dto['ingredientId'])->lockForUpdate()->first();
            if (!$ing) throw new \Exception('Ingredient not found.', 404);

            $settings = RestaurantSettings::find('default');
            $allowNegative = $settings ? (bool)$settings->allowNegativeStock : true;

            $qtyChange = (float)$dto['quantityChange'];
            $balanceBefore = (float)$ing->currentStock;
            $balanceAfter = $balanceBefore + $qtyChange;

            if (!$allowNegative && $balanceAfter < 0) {
                throw new \Exception("Insufficient stock for manual adjustment on ingredient: {$ing->name}", 400);
            }

            $avgCost = (float)$ing->averageCost;
            $totalCostSnapshot = $qtyChange * $avgCost;

            $txType = ($dto['type'] === 'ADJUSTMENT_IN') ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';

            $st = StockTransaction::create([
                'id' => (string)Str::uuid(),
                'ingredientId' => $dto['ingredientId'],
                'type' => $txType,
                'quantityChange' => $qtyChange,
                'unitCostSnapshot' => $avgCost,
                'totalCostSnapshot' => $totalCostSnapshot,
                'balanceBefore' => $balanceBefore,
                'balanceAfter' => $balanceAfter,
                'averageCostBefore' => $avgCost,
                'averageCostAfter' => $avgCost,
                'notes' => $dto['reason'] ?? 'Manual stock adjustment.',
                'changedById' => $userId,
                'createdAt' => now(),
            ]);

            $ing->currentStock = $balanceAfter;
            $ing->save();

            return $st;
        });
    }

    public function reconcileStockCount(array $items, string $userId): array
    {
        $this->checkPermission($userId, 'managerCanManageInventory');

        if (empty($items)) {
            throw new \Exception('Reconciliation batch cannot be empty.', 400);
        }

        // Reject duplicate ingredient IDs in batch
        $ingIds = array_map(fn($it) => $it['ingredientId'], $items);
        if (count($ingIds) !== count(array_unique($ingIds))) {
            throw new \Exception('Duplicate ingredient IDs found in reconciliation batch.', 400);
        }

        return DB::transaction(function () use ($items, $userId, $ingIds) {
            $ingredientsMap = Ingredient::whereIn('id', $ingIds)->lockForUpdate()->get()->keyBy('id');

            if (count($ingredientsMap) !== count($ingIds)) {
                throw new \Exception('One or more ingredients in the reconciliation batch do not exist.', 404);
            }

            $settings = RestaurantSettings::find('default');
            $allowNegativeStock = $settings ? (bool)$settings->allowNegativeStock : true;

            $reconciledItems = [];

            foreach ($items as $item) {
                $ing = $ingredientsMap->get($item['ingredientId']);
                $physicalCount = (float)$item['physicalCount'];
                $currentStock = (float)$ing->currentStock;
                $variance = round($physicalCount - $currentStock, 3);
                $avgCost = (float)$ing->averageCost;

                if (!$allowNegativeStock && $physicalCount < 0) {
                    throw new \Exception("Negative physical count not permitted for ingredient: {$ing->name}", 400);
                }

                if ($variance != 0) {
                    $totalCostSnapshot = round($variance * $avgCost, 2);

                    StockTransaction::create([
                        'id' => (string)Str::uuid(),
                        'ingredientId' => $ing->id,
                        'type' => 'STOCK_COUNT_VARIANCE',
                        'quantityChange' => $variance,
                        'unitCostSnapshot' => $avgCost,
                        'totalCostSnapshot' => $totalCostSnapshot,
                        'balanceBefore' => $currentStock,
                        'balanceAfter' => $physicalCount,
                        'averageCostBefore' => $avgCost,
                        'averageCostAfter' => $avgCost,
                        'referenceType' => 'STOCK_COUNT',
                        'notes' => "Physical stock count reconciliation: system {$currentStock}, physical {$physicalCount}, variance {$variance}",
                        'changedById' => $userId,
                        'createdAt' => now(),
                    ]);

                    $ing->currentStock = $physicalCount;
                    $ing->save();
                }

                $reconciledItems[] = [
                    'ingredientId' => $ing->id,
                    'ingredientName' => $ing->name,
                    'unit' => $ing->unit,
                    'systemStock' => $currentStock,
                    'physicalCount' => $physicalCount,
                    'variance' => $variance,
                    'costImpact' => round($variance * $avgCost, 2),
                    'reconciled' => true,
                ];
            }

            return [
                'message' => 'Stock reconciliation completed successfully.',
                'reconciledCount' => count($reconciledItems),
                'items' => $reconciledItems,
            ];
        });
    }

    // ==========================================
    // LEDGER & COSTING & EXPORTS
    // ==========================================

    public function getLedger(string $userId): array
    {
        $hasCostPermission = true;
        try {
            $this->checkPermission($userId, 'managerCanViewInventoryCost');
        } catch (\Exception $e) {
            $hasCostPermission = false;
        }

        $txs = StockTransaction::with(['ingredient', 'changedBy'])->orderBy('createdAt', 'desc')->get();

        if (!$hasCostPermission) {
            return $txs->map(function ($t) {
                $arr = $t->toArray();
                $arr['reason'] = $arr['notes'] ?? null;
                unset($arr['unitCostSnapshot'], $arr['totalCostSnapshot'], $arr['averageCostBefore'], $arr['averageCostAfter']);
                return $arr;
            })->toArray();
        }

        return $txs->map(function ($t) {
            $arr = $t->toArray();
            $arr['reason'] = $arr['notes'] ?? null;
            return $arr;
        })->toArray();
    }

    public function getValueEstimate(string $userId): array
    {
        $this->checkPermission($userId, 'managerCanViewInventoryCost');

        $ingredients = Ingredient::all();
        $totalValue = 0.0;
        $breakdown = [];

        foreach ($ingredients as $ing) {
            $stock = (float)$ing->currentStock;
            $avg = (float)$ing->averageCost;
            $val = $stock * $avg;
            $totalValue += $val;

            $breakdown[] = [
                'id' => $ing->id,
                'name' => $ing->name,
                'sku' => $ing->sku,
                'currentStock' => $ing->currentStock,
                'averageCost' => $ing->averageCost,
                'estimatedValue' => $val,
            ];
        }

        return [
            'totalEstimatedValue' => $totalValue,
            'ingredients' => $breakdown,
        ];
    }

    public function getFoodCost(string $startDate, string $endDate, string $userId): array
    {
        $this->checkPermission($userId, 'managerCanViewInventoryCost');

        $start = date('Y-m-d H:i:s', strtotime($startDate));
        $end = date('Y-m-d H:i:s', strtotime($endDate));

        $txs = StockTransaction::whereBetween('createdAt', [$start, $end])
            ->whereIn('type', ['RECIPE_CONSUMPTION', 'CONSUMPTION_REVERSAL'])
            ->get();

        $totalFoodCost = 0.0;
        foreach ($txs as $t) {
            $totalFoodCost -= (float)$t->totalCostSnapshot;
        }

        $bills = Bill::whereBetween('finalizedAt', [$start, $end])
            ->whereIn('status', ['FINALIZED', 'PAID'])
            ->get();

        $totalSales = 0.0;
        foreach ($bills as $b) {
            $totalSales += (float)$b->taxableAmount;
        }

        $foodCostPercentage = $totalSales > 0 ? ($totalFoodCost / $totalSales) * 100 : 0.0;

        return [
            'totalFoodCost' => $totalFoodCost,
            'totalSalesRevenue' => $totalSales,
            'foodCostPercentage' => $foodCostPercentage,
        ];
    }

    public function getWastageAnalytics(string $startDate, string $endDate, string $userId): array
    {
        $this->checkPermission($userId, 'managerCanViewInventoryCost');

        $start = date('Y-m-d H:i:s', strtotime($startDate));
        $end = date('Y-m-d H:i:s', strtotime($endDate));

        $txs = StockTransaction::with('ingredient')
            ->whereBetween('createdAt', [$start, $end])
            ->where('type', 'WASTAGE')
            ->get();

        $totalWastageCost = 0.0;
        $reasonBreakdown = [];
        $ingredientBreakdown = [];

        foreach ($txs as $t) {
            $cost = abs((float)$t->totalCostSnapshot);
            $qty = abs((float)$t->quantityChange);
            $totalWastageCost += $cost;

            $reason = strtolower($t->reason ?? 'unknown');
            $rCat = 'OTHER';
            if (str_contains($reason, 'expired')) $rCat = 'EXPIRED';
            elseif (str_contains($reason, 'spoiled')) $rCat = 'SPOILED';
            elseif (str_contains($reason, 'spilled')) $rCat = 'SPILLED';
            elseif (str_contains($reason, 'burnt')) $rCat = 'BURNT';

            $reasonBreakdown[$rCat] = ($reasonBreakdown[$rCat] ?? 0.0) + $cost;

            $ingId = $t->ingredientId;
            if (!isset($ingredientBreakdown[$ingId])) {
                $ingredientBreakdown[$ingId] = [
                    'name' => $t->ingredient->name,
                    'cost' => 0.0,
                    'qty' => 0.0,
                ];
            }
            $ingredientBreakdown[$ingId]['cost'] += $cost;
            $ingredientBreakdown[$ingId]['qty'] += $qty;
        }

        $ingredientsList = [];
        foreach ($ingredientBreakdown as $id => $item) {
            $ingredientsList[] = [
                'ingredientId' => $id,
                'name' => $item['name'],
                'totalCost' => $item['cost'],
                'totalQuantity' => $item['qty'],
            ];
        }

        $reasonsList = [];
        foreach ($reasonBreakdown as $reason => $cost) {
            $reasonsList[] = [
                'reason' => $reason,
                'totalCost' => $cost,
            ];
        }

        return [
            'totalWastageCost' => $totalWastageCost,
            'byReason' => $reasonsList,
            'byIngredient' => $ingredientsList,
        ];
    }

    public function getOperatingContribution(string $startDate, string $endDate, string $userId): array
    {
        $this->checkPermission($userId, 'managerCanViewProfitEstimate');

        $start = date('Y-m-d H:i:s', strtotime($startDate));
        $end = date('Y-m-d H:i:s', strtotime($endDate));

        $bills = Bill::whereBetween('finalizedAt', [$start, $end])
            ->whereIn('status', ['FINALIZED', 'PAID'])
            ->get();
        $revenue = 0.0;
        foreach ($bills as $b) {
            $revenue += (float)$b->taxableAmount;
        }

        $foodCostTxs = StockTransaction::whereBetween('createdAt', [$start, $end])
            ->whereIn('type', ['RECIPE_CONSUMPTION', 'CONSUMPTION_REVERSAL'])
            ->get();
        $foodCost = 0.0;
        foreach ($foodCostTxs as $t) {
            $foodCost -= (float)$t->totalCostSnapshot;
        }

        $expenses = Expense::whereBetween('expenseDate', [$start, $end])
            ->where('status', '!=', 'VOIDED')
            ->get();
        $totalExpenses = 0.0;
        foreach ($expenses as $e) {
            $totalExpenses += (float)$e->amount;
        }

        return [
            'salesRevenue' => $revenue,
            'foodCost' => $foodCost,
            'operatingExpenses' => $totalExpenses,
            'estimatedOperatingContribution' => $revenue - $foodCost - $totalExpenses,
        ];
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

    private function buildCsvString(array $headers, array $rows): string
    {
        $content = [
            implode(',', array_map(fn($h) => '"' . $this->sanitizeCsvCell($h) . '"', $headers))
        ];
        foreach ($rows as $row) {
            $content[] = implode(',', array_map(fn($c) => '"' . $this->sanitizeCsvCell($c) . '"', $row));
        }
        return implode("
", $content);
    }

    public function exportLedgerCsv(string $userId): string
    {
        $list = $this->getLedger($userId);
        $headers = [
            'Transaction ID', 'Ingredient Name', 'SKU', 'Type', 'Quantity Change',
            'Unit Cost Snapshot', 'Total Cost Snapshot', 'Balance Before', 'Balance After',
            'Average Cost Before', 'Average Cost After', 'Reference Type', 'Reference ID',
            'Reason', 'Changed By', 'Created At'
        ];

        $rows = array_map(fn($t) => [
            $t['id'],
            $t['ingredient']['name'] ?? '',
            $t['ingredient']['sku'] ?? '',
            $t['type'],
            $t['quantityChange'] ?? '',
            $t['unitCostSnapshot'] ?? '',
            $t['totalCostSnapshot'] ?? '',
            $t['balanceBefore'] ?? '',
            $t['balanceAfter'] ?? '',
            $t['averageCostBefore'] ?? '',
            $t['averageCostAfter'] ?? '',
            $t['referenceType'] ?? '',
            $t['referenceId'] ?? '',
            $t['reason'] ?? '',
            $t['changed_by']['name'] ?? $t['changedBy']['name'] ?? '',
            $t['createdAt'] ?? '',
        ], $list);

        return $this->buildCsvString($headers, $rows);
    }

    public function exportStockBalanceCsv(string $userId): string
    {
        $list = $this->findAllIngredients($userId);
        $headers = [
            'Ingredient Name', 'SKU', 'Unit', 'Category', 'Current Stock',
            'Average Cost', 'Total Value', 'Minimum Stock', 'Reorder Level'
        ];

        $rows = array_map(function ($ing) {
            $stock = (float)($ing['currentStock'] ?? 0);
            $avg = (float)($ing['averageCost'] ?? 0);
            return [
                $ing['name'],
                $ing['sku'] ?? '',
                $ing['unit'],
                $ing['category'],
                $ing['currentStock'] ?? 0,
                $ing['averageCost'] ?? 0,
                $stock * $avg,
                $ing['minimumStock'] ?? 0,
                $ing['reorderLevel'] ?? 0,
            ];
        }, $list);

        return $this->buildCsvString($headers, $rows);
    }

    public function exportWastageCsv(string $userId): string
    {
        $list = $this->findAllWastage($userId);
        $headers = [
            'Wastage ID', 'Ingredient Name', 'Quantity Wasted', 'Reason',
            'Notes', 'Recorded By', 'Recorded At'
        ];

        $rows = array_map(fn($w) => [
            $w['id'],
            $w['ingredient']['name'] ?? '',
            $w['quantity'],
            $w['reason'],
            $w['notes'] ?? '',
            $w['recorded_by']['name'] ?? $w['recordedBy']['name'] ?? '',
            $w['recordedAt'] ?? '',
        ], $list);

        return $this->buildCsvString($headers, $rows);
    }
}
