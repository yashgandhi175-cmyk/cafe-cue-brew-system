<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\MenuVariant;
use App\Models\Addon;
use App\Models\MenuItemAddon;
use App\Models\Ingredient;
use App\Models\Supplier;
use App\Models\Recipe;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderItemAddon;
use App\Models\StockTransaction;
use App\Models\OrderStockConsumption;
use App\Models\OrderStockConsumptionReversal;
use App\Models\OrderStatusHistory;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\RestaurantSettings;
use App\Services\OrderService;
use App\Services\InventoryService;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class Phase1RecipeInventoryHardeningTest extends TestCase
{
    protected $owner;
    protected $manager;
    protected $cashier;
    protected $ownerToken;

    protected function setUp(): void
    {
        parent::setUp();

        RestaurantSettings::updateOrCreate(
            ['id' => 'default'],
            [
                'restaurantName' => 'Café Cue & Brew',
                'enableGst' => true,
                'gstPercentage' => 5.0,
                'enableCash' => true,
                'allowNegativeStock' => true,
                'managerCanManageInventory' => true,
                'managerCanViewInventoryCost' => true,
            ]
        );

        $this->owner = $this->createStaff('OWNER');
        $this->manager = $this->createStaff('MANAGER');
        $this->cashier = $this->createStaff('CASHIER');

        $this->ownerToken = $this->createStaffToken($this->owner);
    }

    protected function tearDown(): void
    {
        if ($this->owner) {
            $purchaseIds = Purchase::where('createdById', $this->owner->id)->pluck('id')->toArray();
            if (!empty($purchaseIds)) {
                PurchaseItem::whereIn('purchaseId', $purchaseIds)->delete();
                StockTransaction::where('referenceType', 'PURCHASE')->whereIn('referenceId', $purchaseIds)->delete();
                Purchase::whereIn('id', $purchaseIds)->delete();
            }

            $orderIds = Order::where('createdById', $this->owner->id)->pluck('id')->toArray();
            if (!empty($orderIds)) {
                $orderItemIds = OrderItem::whereIn('orderId', $orderIds)->pluck('id')->toArray();
                if (!empty($orderItemIds)) {
                    OrderItemAddon::whereIn('orderItemId', $orderItemIds)->delete();
                }
                OrderItem::whereIn('id', $orderItemIds)->delete();
                OrderStockConsumption::whereIn('orderId', $orderIds)->delete();
                OrderStockConsumptionReversal::whereIn('orderId', $orderIds)->delete();
                OrderStatusHistory::whereIn('orderId', $orderIds)->delete();
                StockTransaction::where('referenceType', 'ORDER')->whereIn('referenceId', $orderIds)->update(['reversesStockTransactionId' => null]);
                StockTransaction::where('referenceType', 'ORDER')->whereIn('referenceId', $orderIds)->delete();
                Order::whereIn('id', $orderIds)->delete();
            }

            StockTransaction::where('changedById', $this->owner->id)->delete();

            $supplierIds = Supplier::where('name', 'like', 'Test Supplier WAC%')->pluck('id')->toArray();
            if (!empty($supplierIds)) {
                $sPurIds = Purchase::whereIn('supplierId', $supplierIds)->pluck('id')->toArray();
                if (!empty($sPurIds)) {
                    PurchaseItem::whereIn('purchaseId', $sPurIds)->delete();
                    StockTransaction::where('referenceType', 'PURCHASE')->whereIn('referenceId', $sPurIds)->delete();
                    Purchase::whereIn('id', $sPurIds)->delete();
                }
                Supplier::whereIn('id', $supplierIds)->delete();
            }

            $this->owner->sessions()->delete();
            $this->owner->delete();
        }
        if ($this->manager) { $this->manager->sessions()->delete(); $this->manager->delete(); }
        if ($this->cashier) { $this->cashier->sessions()->delete(); $this->cashier->delete(); }

        parent::tearDown();
    }

    private function createStaff(string $role): Staff
    {
        $id = (string)Str::uuid();
        return Staff::create([
            'id' => $id,
            'name' => "Staff {$role} P1H",
            'phone' => '+919' . rand(100000000, 999999999),
            'role' => $role,
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
            'failedAttempts' => 0,
        ]);
    }

    private function createStaffToken(Staff $staff): string
    {
        $sid = (string)Str::uuid();
        $token = JwtHelper::generateToken([
            'sub' => $staff->id,
            'role' => $staff->role,
            'sid' => $sid,
        ], env('JWT_SECRET', 'dev-secret-key'));

        StaffSession::create([
            'id' => $sid,
            'staffId' => $staff->id,
            'token' => hash('sha256', $token),
            'expiredAt' => date('Y-m-d H:i:s', time() + 43200),
            'isActive' => true,
            'createdAt' => date('Y-m-d H:i:s'),
        ]);

        return $token;
    }

    private function createIngredient(string $name, float $stock = 1000.0, float $avgCost = 1.5): Ingredient
    {
        return Ingredient::create([
            'id' => (string)Str::uuid(),
            'name' => $name . '_' . Str::random(6),
            'unit' => 'GM',
            'category' => 'COFFEE',
            'currentStock' => $stock,
            'minimumStock' => 100.0,
            'reorderLevel' => 200.0,
            'averageCost' => $avgCost,
            'lastPurchaseCost' => $avgCost,
            'isActive' => true,
        ]);
    }

    private function createCategory(): Category
    {
        return Category::create([
            'id' => (string)Str::uuid(),
            'name' => 'Beverages_' . Str::random(6),
            'displayOrder' => 1,
            'isActive' => true,
        ]);
    }

    private function createMenuItem(Category $cat, string $name, float $price = 150.0): MenuItem
    {
        return MenuItem::create([
            'id' => (string)Str::uuid(),
            'categoryId' => $cat->id,
            'name' => $name . '_' . Str::random(6),
            'basePrice' => $price,
            'isVeg' => true,
            'available' => true,
            'isActive' => true,
        ]);
    }

    private function createOrderWithItem(MenuItem $item, ?string $variantId = null, int $quantity = 1, array $addons = []): Order
    {
        $order = Order::create([
            'id' => (string)Str::uuid(),
            'orderNumber' => 'ORD-P1-' . rand(10000, 99999) . '-' . Str::random(4),
            'publicTrackingToken' => Str::random(32),
            'source' => 'OWNER_POS',
            'status' => 'SERVED',
            'paymentStatus' => 'PAID',
            'subtotal' => 200.0,
            'discount' => 0.0,
            'taxableAmount' => 200.0,
            'cgst' => 5.0,
            'sgst' => 5.0,
            'grandTotal' => 210.0,
            'createdById' => $this->owner->id,
            'inventoryDeducted' => false,
            'createdAt' => now(),
            'updatedAt' => now(),
        ]);

        $orderItem = OrderItem::create([
            'id' => (string)Str::uuid(),
            'orderId' => $order->id,
            'menuItemId' => $item->id,
            'variantId' => $variantId,
            'nameSnapshot' => $item->name,
            'priceSnapshot' => $item->basePrice,
            'quantity' => $quantity,
            'totalPrice' => (float)$item->basePrice * $quantity,
        ]);

        foreach ($addons as $addon) {
            OrderItemAddon::create([
                'id' => (string)Str::uuid(),
                'orderItemId' => $orderItem->id,
                'addonId' => $addon->id,
                'nameSnapshot' => $addon->name,
                'priceSnapshot' => $addon->price,
            ]);
        }

        return $order;
    }

    // 1. Single order inventory deduction
    public function test_single_order_inventory_deduction(): void
    {
        $ing = $this->createIngredient('CoffeeBeans', 1000.0, 2.0);
        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'Espresso');

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 18.0,
        ]);

        $order = $this->createOrderWithItem($item, null, 2);

        $orderService = app(OrderService::class);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);

        $order->refresh();
        $ing->refresh();

        $this->assertTrue((bool)$order->inventoryDeducted);
        $this->assertEquals(964.0, (float)$ing->currentStock); // 1000 - (18 * 2) = 964

        $tx = StockTransaction::where('referenceId', $order->id)->where('type', 'RECIPE_CONSUMPTION')->first();
        $this->assertNotNull($tx);
        $this->assertEquals(-36.0, (float)$tx->quantityChange);
        $this->assertEquals(1000.0, (float)$tx->balanceBefore);
        $this->assertEquals(964.0, (float)$tx->balanceAfter);
    }

    // 2. Repeated deduction call is idempotent
    public function test_repeated_deduction_call_is_idempotent(): void
    {
        $ing = $this->createIngredient('Milk', 5000.0, 0.06);
        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'HotMilk');

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 200.0,
        ]);

        $order = $this->createOrderWithItem($item, null, 1);

        $orderService = app(OrderService::class);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id); // Second call

        $ing->refresh();
        $this->assertEquals(4800.0, (float)$ing->currentStock);

        $txCount = StockTransaction::where('referenceId', $order->id)->where('type', 'RECIPE_CONSUMPTION')->count();
        $this->assertEquals(1, $txCount);
    }

    // 3. Concurrent deduction attempts cannot double-consume stock
    public function test_concurrent_deduction_attempts_cannot_double_consume_stock(): void
    {
        $ing = $this->createIngredient('Syrup', 1000.0, 0.5);
        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'CaramelLatte');

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 30.0,
        ]);

        $order = $this->createOrderWithItem($item, null, 1);

        $orderService = app(OrderService::class);

        for ($i = 0; $i < 3; $i++) {
            $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);
        }

        $ing->refresh();
        $this->assertEquals(970.0, (float)$ing->currentStock);

        $markerCount = OrderStockConsumption::where('orderId', $order->id)->count();
        $this->assertEquals(1, $markerCount);
    }

    // 4. Variant with recipes uses variant BOM only (Option A)
    public function test_variant_with_recipes_uses_variant_bom_only(): void
    {
        $baseIng = $this->createIngredient('StandardBeans', 1000.0);
        $variantIng = $this->createIngredient('PremiumBeans', 1000.0);

        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'Coffee');

        $variant = MenuVariant::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'name' => 'Large Premium',
            'price' => 200.0,
            'isActive' => true,
        ]);

        // Base recipe on MenuItem
        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $baseIng->id,
            'quantity' => 18.0,
        ]);

        // Variant recipe on MenuVariant
        Recipe::create([
            'id' => (string)Str::uuid(),
            'variantId' => $variant->id,
            'ingredientId' => $variantIng->id,
            'quantity' => 24.0,
        ]);

        $order = $this->createOrderWithItem($item, $variant->id, 1);

        $orderService = app(OrderService::class);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);

        $baseIng->refresh();
        $variantIng->refresh();

        // Option A: base MenuItem ingredient must NOT be deducted
        $this->assertEquals(1000.0, (float)$baseIng->currentStock);
        // Only variant ingredient must be deducted
        $this->assertEquals(976.0, (float)$variantIng->currentStock);
    }

    // 5. Variant without recipes falls back to MenuItem BOM
    public function test_variant_without_recipes_falls_back_to_menuitem_bom(): void
    {
        $baseIng = $this->createIngredient('CommonBeans', 1000.0);
        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'Cappuccino');

        $variant = MenuVariant::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'name' => 'Regular Cup',
            'price' => 160.0,
            'isActive' => true,
        ]);

        // Only MenuItem has recipe
        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $baseIng->id,
            'quantity' => 20.0,
        ]);

        $order = $this->createOrderWithItem($item, $variant->id, 2);

        $orderService = app(OrderService::class);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);

        $baseIng->refresh();
        $this->assertEquals(960.0, (float)$baseIng->currentStock); // 1000 - (20 * 2) = 960
    }

    // 6. MenuItem without variant uses MenuItem BOM
    public function test_menuitem_without_variant_uses_menuitem_bom(): void
    {
        $ing = $this->createIngredient('TeaLeaves', 500.0);
        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'MasalaChai');

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 10.0,
        ]);

        $order = $this->createOrderWithItem($item, null, 3);

        $orderService = app(OrderService::class);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);

        $ing->refresh();
        $this->assertEquals(470.0, (float)$ing->currentStock); // 500 - (10 * 3) = 470
    }

    // 7. Zero-quantity recipe is ignored
    public function test_zero_quantity_recipe_is_ignored(): void
    {
        $ing = $this->createIngredient('WaterPlaceholder', 1000.0);
        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'PlainWater');

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 0.0,
        ]);

        $order = $this->createOrderWithItem($item, null, 1);

        $orderService = app(OrderService::class);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);

        $ing->refresh();
        $this->assertEquals(1000.0, (float)$ing->currentStock); // Unchanged

        $txCount = StockTransaction::where('referenceId', $order->id)->count();
        $this->assertEquals(0, $txCount); // Zero rows created
    }

    // 8. Multiple recipe lines using same ingredient aggregate correctly
    public function test_multiple_recipe_lines_using_same_ingredient_aggregate_correctly(): void
    {
        $sugar = $this->createIngredient('Sugar', 2000.0);
        $cat = $this->createCategory();
        $item1 = $this->createMenuItem($cat, 'SweetTea');
        $item2 = $this->createMenuItem($cat, 'SweetCoffee');

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item1->id,
            'ingredientId' => $sugar->id,
            'quantity' => 15.0,
        ]);

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item2->id,
            'ingredientId' => $sugar->id,
            'quantity' => 25.0,
        ]);

        $order = Order::create([
            'id' => (string)Str::uuid(),
            'orderNumber' => 'ORD-AGG-' . rand(10000, 99999) . '-' . Str::random(4),
            'publicTrackingToken' => Str::random(32),
            'source' => 'OWNER_POS',
            'status' => 'SERVED',
            'paymentStatus' => 'PAID',
            'subtotal' => 200.0,
            'taxableAmount' => 200.0,
            'grandTotal' => 210.0,
            'createdById' => $this->owner->id,
            'inventoryDeducted' => false,
        ]);

        OrderItem::create([
            'id' => (string)Str::uuid(),
            'orderId' => $order->id,
            'menuItemId' => $item1->id,
            'nameSnapshot' => $item1->name,
            'priceSnapshot' => 100.0,
            'quantity' => 2, // 15 * 2 = 30
            'totalPrice' => 200.0,
        ]);

        OrderItem::create([
            'id' => (string)Str::uuid(),
            'orderId' => $order->id,
            'menuItemId' => $item2->id,
            'nameSnapshot' => $item2->name,
            'priceSnapshot' => 100.0,
            'quantity' => 1, // 25 * 1 = 25
            'totalPrice' => 100.0,
        ]);

        $orderService = app(OrderService::class);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);

        $sugar->refresh();
        $this->assertEquals(1945.0, (float)$sugar->currentStock); // 2000 - 55 = 1945

        $tx = StockTransaction::where('referenceId', $order->id)->where('ingredientId', $sugar->id)->first();
        $this->assertEquals(-55.0, (float)$tx->quantityChange);
    }

    // 9 & 10. Addon recipe is consumed following OrderItem quantity semantics
    public function test_addon_recipe_is_consumed_following_orderitem_quantity(): void
    {
        $bread = $this->createIngredient('Bun', 100.0);
        $cheese = $this->createIngredient('CheeseSlice', 100.0);

        $cat = $this->createCategory();
        $burger = $this->createMenuItem($cat, 'VegBurger', 120.0);

        $addon = Addon::create([
            'id' => (string)Str::uuid(),
            'name' => 'Extra Cheese ' . Str::random(5),
            'price' => 30.0,
            'isActive' => true,
        ]);

        MenuItemAddon::create([
            'menuItemId' => $burger->id,
            'addonId' => $addon->id,
        ]);

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $burger->id,
            'ingredientId' => $bread->id,
            'quantity' => 1.0,
        ]);

        Recipe::create([
            'id' => (string)Str::uuid(),
            'addonId' => $addon->id,
            'ingredientId' => $cheese->id,
            'quantity' => 2.0, // 2 slices per extra cheese addon
        ]);

        // Order 3 burgers with Extra Cheese
        $order = $this->createOrderWithItem($burger, null, 3, [$addon]);

        $orderService = app(OrderService::class);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);

        $bread->refresh();
        $cheese->refresh();

        $this->assertEquals(97.0, (float)$bread->currentStock); // 100 - (1 * 3) = 97
        $this->assertEquals(94.0, (float)$cheese->currentStock); // 100 - (2 * 3) = 94
    }

    // 11. Completed order cancellation reverses stock
    public function test_completed_order_cancellation_reverses_stock(): void
    {
        $ing = $this->createIngredient('Chocolate', 1000.0, 1.2);
        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'HotChocolate');

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 50.0,
        ]);

        $order = $this->createOrderWithItem($item, null, 2);

        $orderService = app(OrderService::class);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);

        $ing->refresh();
        $this->assertEquals(900.0, (float)$ing->currentStock);

        // Cancel the order
        $orderService->cancelOrder($order->id, 'CUSTOMER_REQUEST', 'Changed mind', $this->owner->id, 'OWNER');

        $ing->refresh();
        $order->refresh();

        $this->assertEquals('CANCELLED', $order->status);
        $this->assertFalse((bool)$order->inventoryDeducted);
        $this->assertEquals(1000.0, (float)$ing->currentStock); // Restored to 1000

        $reversalTx = StockTransaction::where('referenceId', $order->id)
            ->where('type', 'CONSUMPTION_REVERSAL')
            ->first();
        $this->assertNotNull($reversalTx);
        $this->assertEquals(100.0, (float)$reversalTx->quantityChange);
        $this->assertEquals(900.0, (float)$reversalTx->balanceBefore);
        $this->assertEquals(1000.0, (float)$reversalTx->balanceAfter);
    }

    // 12. Completed order void reverses stock
    public function test_completed_order_void_reverses_stock(): void
    {
        $ing = $this->createIngredient('Butter', 500.0, 0.8);
        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'ButterToast');

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 20.0,
        ]);

        $order = $this->createOrderWithItem($item, null, 1);

        $orderService = app(OrderService::class);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);

        $ing->refresh();
        $this->assertEquals(480.0, (float)$ing->currentStock);

        // Void the order
        $orderService->voidOrder($order->id, 'Accidental order entered', $this->owner->id, 'OWNER');

        $ing->refresh();
        $order->refresh();

        $this->assertEquals('VOIDED', $order->status);
        $this->assertFalse((bool)$order->inventoryDeducted);
        $this->assertEquals(500.0, (float)$ing->currentStock); // Restored to 500
    }

    // 13. Repeated cancellation/void does not reverse twice
    public function test_repeated_cancellation_or_void_does_not_reverse_twice(): void
    {
        $ing = $this->createIngredient('Oil', 1000.0, 0.4);
        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'Fries');

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 40.0,
        ]);

        $order = $this->createOrderWithItem($item, null, 1);

        $orderService = app(OrderService::class);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);

        $ing->refresh();
        $this->assertEquals(960.0, (float)$ing->currentStock);

        // Multiple reversal invocations
        $orderService->reverseStockForCancelledOrder($order->id, $this->owner->id);
        $orderService->reverseStockForCancelledOrder($order->id, $this->owner->id);

        $ing->refresh();
        $this->assertEquals(1000.0, (float)$ing->currentStock);

        $reversalCount = StockTransaction::where('referenceId', $order->id)
            ->where('type', 'CONSUMPTION_REVERSAL')
            ->count();
        $this->assertEquals(1, $reversalCount);
    }

    // 14. Failed deduction rolls back all stock changes and ledger rows
    public function test_failed_deduction_rolls_back_all_stock_changes(): void
    {
        RestaurantSettings::where('id', 'default')->update(['allowNegativeStock' => false]);

        $ing1 = $this->createIngredient('AvailableIng', 100.0);
        $ing2 = $this->createIngredient('DepletedIng', 0.0); // 0 stock

        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'ComboItem');

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing1->id,
            'quantity' => 10.0,
        ]);

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing2->id,
            'quantity' => 10.0,
        ]);

        $order = $this->createOrderWithItem($item, null, 1);

        $orderService = app(OrderService::class);

        try {
            $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);
            $this->fail('Expected exception on insufficient stock.');
        } catch (\Exception $e) {
            $this->assertStringContainsString('Insufficient stock', $e->getMessage());
        }

        $ing1->refresh();
        $ing2->refresh();
        $order->refresh();

        $this->assertEquals(100.0, (float)$ing1->currentStock); // Must be rolled back
        $this->assertEquals(0.0, (float)$ing2->currentStock);
        $this->assertFalse((bool)$order->inventoryDeducted);

        $txCount = StockTransaction::where('referenceId', $order->id)->count();
        $this->assertEquals(0, $txCount);
    }

    // 15. Negative stock behavior respects allowNegativeStock
    public function test_negative_stock_behavior_respects_allow_negative_stock(): void
    {
        RestaurantSettings::where('id', 'default')->update(['allowNegativeStock' => true]);

        $ing = $this->createIngredient('ZeroStockIng', 0.0);
        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'AllowedNegItem');

        Recipe::create([
            'id' => (string)Str::uuid(),
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 15.0,
        ]);

        $order = $this->createOrderWithItem($item, null, 1);

        $orderService = app(OrderService::class);
        $orderService->deductStockForCompletedOrder($order->id, $this->owner->id);

        $ing->refresh();
        $this->assertEquals(-15.0, (float)$ing->currentStock);
    }

    // 16. WAC handles positive, zero and negative starting stock safely
    public function test_wac_handles_positive_zero_and_negative_starting_stock_safely(): void
    {
        $supplier = Supplier::create([
            'id' => (string)Str::uuid(),
            'name' => 'Test Supplier WAC ' . Str::random(5),
            'phone' => '+919988776655',
        ]);

        $inventoryService = app(InventoryService::class);

        // Case A: Starting stock > 0 (100 @ 2.0 = 200). Buy 100 @ 4.0 = 400. New WAC = 600 / 200 = 3.0
        $ingA = $this->createIngredient('WacPos', 100.0, 2.0);
        $purA = $inventoryService->createPurchase([
            'supplierId' => $supplier->id,
            'items' => [
                [
                    'ingredientId' => $ingA->id,
                    'purchaseUnit' => 'GM',
                    'purchaseQuantity' => 100.0,
                    'conversionFactor' => 1.0,
                    'unitPurchaseCost' => 4.0,
                ],
            ],
        ], $this->owner->id);
        $inventoryService->finalizePurchase($purA->id, $this->owner->id);
        $ingA->refresh();
        $this->assertEquals(3.0, (float)$ingA->averageCost);
        $this->assertEquals(200.0, (float)$ingA->currentStock);

        // Case B: Starting stock = 0. Buy 50 @ 5.0. New WAC = 5.0
        $ingB = $this->createIngredient('WacZero', 0.0, 0.0);
        $purB = $inventoryService->createPurchase([
            'supplierId' => $supplier->id,
            'items' => [
                [
                    'ingredientId' => $ingB->id,
                    'purchaseUnit' => 'GM',
                    'purchaseQuantity' => 50.0,
                    'conversionFactor' => 1.0,
                    'unitPurchaseCost' => 5.0,
                ],
            ],
        ], $this->owner->id);
        $inventoryService->finalizePurchase($purB->id, $this->owner->id);
        $ingB->refresh();
        $this->assertEquals(5.0, (float)$ingB->averageCost);

        // Case C: Starting stock < 0 (-20 @ 3.0). Buy 20 @ 6.0 (Resulting stock = 0). New WAC = 6.0 without div by zero
        $ingC = $this->createIngredient('WacNeg', -20.0, 3.0);
        $purC = $inventoryService->createPurchase([
            'supplierId' => $supplier->id,
            'items' => [
                [
                    'ingredientId' => $ingC->id,
                    'purchaseUnit' => 'GM',
                    'purchaseQuantity' => 20.0,
                    'conversionFactor' => 1.0,
                    'unitPurchaseCost' => 6.0,
                ],
            ],
        ], $this->owner->id);
        $inventoryService->finalizePurchase($purC->id, $this->owner->id);
        $ingC->refresh();
        $this->assertEquals(6.0, (float)$ingC->averageCost);
        $this->assertEquals(0.0, (float)$ingC->currentStock);
    }

    // 17. Recipe duplicate protection
    public function test_recipe_duplicate_protection(): void
    {
        $ing = $this->createIngredient('DupIng', 100.0);
        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'DupItem');

        $inventoryService = app(InventoryService::class);

        $inventoryService->createRecipe([
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 10.0,
        ], $this->owner->id);

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('Recipe already exists for this item and ingredient.');

        $inventoryService->createRecipe([
            'menuItemId' => $item->id,
            'ingredientId' => $ing->id,
            'quantity' => 15.0,
        ], $this->owner->id);
    }

    // 18. OrderItemAddon addon relationship works
    public function test_order_item_addon_relationship_works(): void
    {
        $cat = $this->createCategory();
        $item = $this->createMenuItem($cat, 'ItemWithAddon');

        $addon = Addon::create([
            'id' => (string)Str::uuid(),
            'name' => 'Rel Addon ' . Str::random(5),
            'price' => 25.0,
            'isActive' => true,
        ]);

        $order = $this->createOrderWithItem($item, null, 1, [$addon]);
        $orderItem = $order->items()->first();
        $orderItemAddon = $orderItem->addons()->first();

        $this->assertNotNull($orderItemAddon);
        $this->assertNotNull($orderItemAddon->addon);
        $this->assertEquals($addon->id, $orderItemAddon->addon->id);
        $this->assertEquals($addon->name, $orderItemAddon->addon->name);
    }
}
