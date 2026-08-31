<?php

namespace App\Services;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderItemAddon;
use App\Models\OrderStatusHistory;
use App\Models\RestaurantTable;
use App\Models\RestaurantSettings;
use App\Models\Customer;
use App\Models\Bill;
use App\Models\AuditLog;
use App\Models\CustomerCart;
use App\Models\CustomerCartItem;
use App\Models\LoyaltyTransaction;
use App\Models\CouponUsage;
use App\Models\Ingredient;
use App\Models\Recipe;
use App\Models\StockTransaction;
use App\Models\Staff;
use App\Models\OrderStockConsumption;
use App\Models\OrderStockConsumptionReversal;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OrderService
{
    protected $cartPricingService;
    protected $financialCalcService;

    public function __construct(
        CartPricingService $cartPricingService,
        FinancialCalculationService $financialCalcService
    ) {
        $this->cartPricingService = $cartPricingService;
        $this->financialCalcService = $financialCalcService;
    }

    private function normalizePhone(string $phone): string
    {
        $cleaned = preg_replace('/[^0-9]/', '', $phone);
        if (strlen($cleaned) === 10) {
            return '+91' . $cleaned;
        }
        if (strlen($cleaned) === 12 && str_starts_with($cleaned, '91')) {
            return '+' . $cleaned;
        }
        return '+' . $cleaned;
    }

    private function sanitizeOrderResponse(Order $order): array
    {
        $order->loadMissing(['items.addons', 'table', 'customer', 'bills', 'payments']);
        $array = $order->toArray();
        unset($array['idempotencyKey']);
        return $array;
    }

    public function createPosOrder(string $staffId, string $role, array $dto): array
    {
        if ($role === 'WAITER') {
            throw new \Exception('Waiters are not authorized to create POS orders.', 403);
        }

        $orderType = $dto['orderType'] ?? 'DINE_IN';
        if ($orderType === 'DINE_IN' && empty($dto['tableId'])) {
            throw new \Exception('A valid table is required for Dine-in orders.', 400);
        }

        $idempotencyKey = $dto['idempotencyKey'] ?? null;
        if ($idempotencyKey) {
            $existing = Order::where('idempotencyKey', $idempotencyKey)->first();
            if ($existing) {
                return $this->sanitizeOrderResponse($existing);
            }
        }

        $settings = RestaurantSettings::find('default');
        if (!$settings) {
            throw new \Exception('Restaurant settings not found.', 404);
        }

        $table = null;
        if ($orderType === 'DINE_IN' && !empty($dto['tableId'])) {
            $table = RestaurantTable::find($dto['tableId']);
            if (!$table || !$table->isActive) {
                throw new \Exception('Selected table is inactive or invalid.', 400);
            }
        }

        $rawPhone = trim($dto['customerPhone'] ?? '');
        $finalPhone = !empty($rawPhone) ? $this->normalizePhone($rawPhone) : '+910000000000';
        $customerNameVal = !empty($dto['customerName']) ? trim($dto['customerName']) : 'Walk-in Customer';

        // Re-fetch database item, variant, addon prices using CartPricingService
        $cartResult = $this->cartPricingService->resolveAndValidateCart($dto['items'] ?? []);

        // Manual discount calculation
        $manualDiscountAmount = 0.0;
        if (!empty($dto['manualDiscountType']) && !empty($dto['manualDiscountValue'])) {
            $val = (float)$dto['manualDiscountValue'];
            if ($dto['manualDiscountType'] === 'FLAT') {
                $manualDiscountAmount = $val;
            } else {
                $manualDiscountAmount = round(($cartResult['subtotal'] * $val) / 100, 2);
            }
        }

        $calcResult = $this->financialCalcService->calculate([
            'subtotal' => $cartResult['subtotal'],
            'manualDiscount' => $manualDiscountAmount,
            'couponDiscount' => 0,
            'settings' => $settings,
        ]);

        return DB::transaction(function () use ($dto, $staffId, $role, $orderType, $idempotencyKey, $table, $finalPhone, $customerNameVal, $cartResult, $calcResult) {
            $customer = Customer::where('phone', $finalPhone)->first();
            if ($customer) {
                $customer->name = $customerNameVal;
                $customer->marketingConsent = (bool)($dto['marketingConsent'] ?? false);
                $customer->visitCount += 1;
                $customer->save();
            } else {
                $customer = Customer::create([
                    'id' => (string)Str::uuid(),
                    'name' => $customerNameVal,
                    'phone' => $finalPhone,
                    'marketingConsent' => (bool)($dto['marketingConsent'] ?? false),
                    'visitCount' => 1,
                ]);
            }

            $publicTrackingToken = 'TRK_' . strtoupper(Str::random(16));
            $orderNumber = 'CCB-' . date('Ymd') . '-' . rand(1000, 9999);

            $orderSource = 'CASHIER';
            if ($role === 'OWNER') $orderSource = 'OWNER_POS';
            else if ($role === 'MANAGER') $orderSource = 'MANAGER';

            $order = Order::create([
                'id' => (string)Str::uuid(),
                'orderNumber' => $orderNumber,
                'publicTrackingToken' => $publicTrackingToken,
                'idempotencyKey' => $idempotencyKey,
                'customerId' => $customer->id,
                'tableId' => $table ? $table->id : null,
                'tableNumberSnapshot' => $table ? $table->tableNumber : null,
                'source' => $orderSource,
                'status' => 'ACCEPTED',
                'paymentStatus' => 'UNPAID',
                'subtotal' => $calcResult['subtotal'],
                'discount' => $calcResult['discount'],
                'couponDiscount' => $calcResult['couponDiscount'],
                'taxableAmount' => $calcResult['taxableAmount'],
                'cgst' => $calcResult['cgst'],
                'sgst' => $calcResult['sgst'],
                'serviceCharge' => $calcResult['serviceCharge'],
                'nightCharge' => $calcResult['nightCharge'],
                'roundOff' => $calcResult['roundOff'],
                'grandTotal' => $calcResult['grandTotal'],
                'createdById' => $staffId,
                'notes' => $dto['notes'] ?? null,
                'createdAt' => now(),
            ]);

            foreach ($cartResult['validatedItems'] as $valItem) {
                $orderItem = OrderItem::create([
                    'id' => (string)Str::uuid(),
                    'orderId' => $order->id,
                    'menuItemId' => $valItem['menuItemId'],
                    'nameSnapshot' => $valItem['nameSnapshot'],
                    'variantId' => $valItem['variantId'],
                    'variantNameSnapshot' => $valItem['variantNameSnapshot'],
                    'priceSnapshot' => $valItem['priceSnapshot'],
                    'variantPriceSnapshot' => $valItem['variantPriceSnapshot'],
                    'discountSnapshot' => 0.0,
                    'quantity' => $valItem['quantity'],
                    'totalPrice' => $valItem['totalPrice'],
                    'notes' => $valItem['notes'] ?? null,
                ]);

                foreach ($valItem['addons'] as $valAddon) {
                    OrderItemAddon::create([
                        'id' => (string)Str::uuid(),
                        'orderItemId' => $orderItem->id,
                        'addonId' => $valAddon['addonId'],
                        'nameSnapshot' => $valAddon['nameSnapshot'],
                        'priceSnapshot' => $valAddon['priceSnapshot'],
                    ]);
                }
            }

            OrderStatusHistory::create([
                'id' => (string)Str::uuid(),
                'orderId' => $order->id,
                'newStatus' => 'ACCEPTED',
                'changedById' => $staffId,
                'notes' => 'POS order created by staff',
                'changedAt' => now(),
            ]);

            // Draft Bill Creation
            Bill::create([
                'id' => (string)Str::uuid(),
                'orderId' => $order->id,
                'status' => 'DRAFT',
                'subtotal' => $calcResult['subtotal'],
                'discount' => $calcResult['discount'],
                'manualDiscount' => $calcResult['manualDiscount'],
                'couponDiscount' => 0.0,
                'totalDiscount' => $calcResult['discount'],
                'taxableAmount' => $calcResult['taxableAmount'],
                'cgst' => $calcResult['cgst'],
                'sgst' => $calcResult['sgst'],
                'serviceCharge' => $calcResult['serviceCharge'],
                'nightCharge' => $calcResult['nightCharge'],
                'roundOff' => $calcResult['roundOff'],
                'grandTotal' => $calcResult['grandTotal'],
                'createdAt' => now(),
            ]);

            if ($table) {
                $table->status = 'OCCUPIED';
                $table->save();
            }

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staffId,
                'action' => 'ORDER_CREATE_POS',
                'entityType' => 'Order',
                'entityId' => $order->id,
                'newData' => json_encode(['grandTotal' => $calcResult['grandTotal']]),
                'createdAt' => now(),
            ]);

            return $this->sanitizeOrderResponse($order);
        });
    }

    public function getLiveOrders(): array
    {
        $liveStatuses = ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'];
        $orders = Order::whereIn('status', $liveStatuses)
            ->with(['table', 'customer', 'items.addons'])
            ->orderBy('createdAt', 'desc')
            ->get();
        return $orders->toArray();
    }

    public function getOrders(array $filters): array
    {
        $page = max(1, (int)($filters['page'] ?? 1));
        $limit = min(500, max(1, (int)($filters['limit'] ?? 100)));

        $query = Order::with(['table', 'customer', 'items.addons', 'bills', 'payments']);

        if (!empty($filters['status'])) $query->where('status', $filters['status']);
        if (!empty($filters['paymentStatus'])) $query->where('paymentStatus', $filters['paymentStatus']);
        if (!empty($filters['source'])) $query->where('source', $filters['source']);
        if (!empty($filters['tableId'])) $query->where('tableId', $filters['tableId']);

        if (!empty($filters['search'])) {
            $term = trim($filters['search']);
            $query->where(function ($q) use ($term) {
                $q->where('orderNumber', 'like', "%{$term}%")
                  ->orWhereHas('customer', function ($cq) use ($term) {
                      $cq->where('name', 'like', "%{$term}%")
                         ->orWhere('phone', 'like', "%{$term}%");
                  });
            });
        }

        if (!empty($filters['startDate'])) {
            $query->where('createdAt', '>=', $filters['startDate']);
        }
        if (!empty($filters['endDate'])) {
            $query->where('createdAt', '<=', $filters['endDate']);
        }

        $total = $query->count();
        $items = $query->orderBy('createdAt', 'desc')
            ->skip(($page - 1) * $limit)
            ->take($limit)
            ->get();

        return [
            'data' => $items->toArray(),
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'totalPages' => (int)ceil($total / $limit),
            ]
        ];
    }

    public function getOrderById(string $id): Order
    {
        $order = Order::with(['table', 'customer', 'createdBy', 'items.addons', 'statusHistory.changedBy', 'bills', 'payments'])->find($id);
        if (!$order) {
            throw new \Exception('Order not found', 404);
        }
        return $order;
    }

    public function updateOrderStatus(
        string $id,
        string $newStatus,
        string $changedById,
        string $role,
        bool $override = false,
        ?string $overrideReason = null
    ): Order {
        return DB::transaction(function () use ($id, $newStatus, $changedById, $role, $override, $overrideReason) {
            $order = Order::find($id);
            if (!$order) {
                throw new \Exception('Order not found', 404);
            }

            $oldStatus = $order->status;
            if ($oldStatus === $newStatus) {
                return $order;
            }

            if ($override) {
                if ($role !== 'OWNER') {
                    throw new \Exception('Only the OWNER can override status rules.', 400);
                }
                if (empty(trim($overrideReason ?? ''))) {
                    throw new \Exception('An override reason is required.', 400);
                }
            } else {
                $isValid = false;
                if ($oldStatus === 'RECEIVED' && ($newStatus === 'ACCEPTED' || $newStatus === 'PREPARING')) $isValid = true;
                elseif ($oldStatus === 'ACCEPTED' && $newStatus === 'PREPARING') $isValid = true;
                elseif ($oldStatus === 'PREPARING' && ($newStatus === 'READY' || $newStatus === 'SERVED')) $isValid = true;
                elseif ($oldStatus === 'READY' && $newStatus === 'SERVED') $isValid = true;
                elseif ($oldStatus === 'SERVED' && $newStatus === 'COMPLETED') $isValid = true;

                if (!$isValid) {
                    throw new \Exception("Invalid status transition from {$oldStatus} to {$newStatus}. Requires owner override.", 400);
                }

                if ($role === 'WAITER' && !(($oldStatus === 'READY' || $oldStatus === 'PREPARING') && $newStatus === 'SERVED')) {
                    throw new \Exception('Waiter role is permitted to mark orders as SERVED.', 400);
                }

                if ($role === 'CASHIER' && !($oldStatus === 'SERVED' && $newStatus === 'COMPLETED')) {
                    throw new \Exception('Cashier role is permitted to mark orders as COMPLETED.', 400);
                }
            }

            if ($newStatus === 'COMPLETED') {
                if ($order->paymentStatus !== 'PAID' && $order->paymentStatus !== 'CREDIT') {
                    if (!$override || $role !== 'OWNER') {
                        throw new \Exception('Cannot complete an order that is not fully paid. Requires owner override with a reason.', 400);
                    }
                }
            }

            $order->status = $newStatus;
            $order->save();

            if ($newStatus === 'COMPLETED') {
                $this->deductStockForCompletedOrder($id, $changedById);
            } elseif (in_array($newStatus, ['CANCELLED', 'VOIDED'])) {
                $this->reverseStockForCancelledOrder($id, $changedById);
            }

            OrderStatusHistory::create([
                'id' => (string)Str::uuid(),
                'orderId' => $id,
                'oldStatus' => $oldStatus,
                'newStatus' => $newStatus,
                'changedById' => $changedById,
                'notes' => $override ? "Owner override reason: {$overrideReason}" : null,
                'changedAt' => now(),
            ]);

            if (in_array($newStatus, ['COMPLETED', 'CANCELLED', 'VOIDED'])) {
                $this->updateTableStatusIfNeeded($order->tableId);
            } elseif ($order->tableId) {
                RestaurantTable::where('id', $order->tableId)->update(['status' => 'OCCUPIED']);
            }

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $changedById,
                'action' => $override ? 'OWNER_STATUS_OVERRIDE' : 'ORDER_STATUS_CHANGE',
                'entityType' => 'Order',
                'entityId' => $id,
                'oldData' => json_encode(['status' => $oldStatus]),
                'newData' => json_encode(['status' => $newStatus, 'overrideReason' => $overrideReason]),
                'createdAt' => now(),
            ]);

            return $order->load(['table', 'customer']);
        });
    }

    public function cancelOrder(
        string $id,
        string $reason,
        ?string $customReason,
        string $cancelledById,
        string $role
    ): Order {
        if ($role === 'WAITER') {
            throw new \Exception('Waiter role cannot cancel orders.', 400);
        }

        return DB::transaction(function () use ($id, $reason, $customReason, $cancelledById) {
            $order = Order::where('id', $id)->lockForUpdate()->first();
            if (!$order) {
                throw new \Exception('Order not found', 404);
            }

            if (in_array($order->status, ['CANCELLED', 'VOIDED'])) {
                throw new \Exception('Order is already in a cancelled/voided terminal state.', 400);
            }

            // Reverse inventory consumption if already deducted
            $this->reverseStockForCancelledOrder($id, $cancelledById);

            $oldStatus = $order->status;
            $order->status = 'CANCELLED';
            $order->cancellationReason = $customReason ? "{$reason}: {$customReason}" : $reason;
            $order->cancelledById = $cancelledById;
            $order->cancelledAt = now();
            $order->save();

            OrderStatusHistory::create([
                'id' => (string)Str::uuid(),
                'orderId' => $id,
                'oldStatus' => $oldStatus,
                'newStatus' => 'CANCELLED',
                'changedById' => $cancelledById,
                'notes' => $customReason ? "{$reason}: {$customReason}" : $reason,
                'changedAt' => now(),
            ]);

            $this->updateTableStatusIfNeeded($order->tableId);

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $cancelledById,
                'action' => 'ORDER_CANCEL',
                'entityType' => 'Order',
                'entityId' => $id,
                'newData' => json_encode(['cancellationReason' => $reason, 'customReason' => $customReason]),
                'createdAt' => now(),
            ]);

            return $order;
        });
    }

    public function voidOrder(
        string $id,
        string $reason,
        string $voidedById,
        string $role
    ): Order {
        if ($role !== 'OWNER') {
            throw new \Exception('Only the OWNER can void orders.', 400);
        }

        return DB::transaction(function () use ($id, $reason, $voidedById) {
            $order = Order::where('id', $id)->lockForUpdate()->first();
            if (!$order) {
                throw new \Exception('Order not found', 404);
            }

            // Reverse inventory consumption if already deducted
            $this->reverseStockForCancelledOrder($id, $voidedById);

            $oldStatus = $order->status;
            $order->status = 'VOIDED';
            $order->cancellationReason = "VOID: {$reason}";
            $order->cancelledById = $voidedById;
            $order->cancelledAt = now();
            $order->save();

            OrderStatusHistory::create([
                'id' => (string)Str::uuid(),
                'orderId' => $id,
                'oldStatus' => $oldStatus,
                'newStatus' => 'VOIDED',
                'changedById' => $voidedById,
                'notes' => "Voided: {$reason}",
                'changedAt' => now(),
            ]);

            $this->updateTableStatusIfNeeded($order->tableId);

            AuditLog::create([
                'id' => (string)Str::uuid(),
                'staffId' => $voidedById,
                'action' => 'ORDER_VOID',
                'entityType' => 'Order',
                'entityId' => $id,
                'newData' => json_encode(['voidReason' => $reason]),
                'createdAt' => now(),
            ]);

            return $order;
        });
    }

    private function updateTableStatusIfNeeded(?string $tableId): void
    {
        if (!$tableId) return;

        $activeOrdersCount = Order::where('tableId', $tableId)
            ->whereIn('status', ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'])
            ->count();

        $table = RestaurantTable::find($tableId);
        if ($table) {
            if ($activeOrdersCount === 0) {
                if ($table->status !== 'CLEANING') {
                    $table->status = 'AVAILABLE';
                    $table->save();
                }
            } else {
                $table->status = 'OCCUPIED';
                $table->save();
            }
        }
    }

    public function deductStockForCompletedOrder(string $orderId, string $userId): void
    {
        DB::transaction(function () use ($orderId, $userId) {
            // Lock Order row pessimistically to avoid concurrent deduction race conditions
            $order = Order::with(['items.addons'])->where('id', $orderId)->lockForUpdate()->first();
            if (!$order || $order->inventoryDeducted) {
                return;
            }

            // Check consumption idempotency marker
            if (OrderStockConsumption::where('orderId', $orderId)->exists()) {
                $order->inventoryDeducted = true;
                $order->save();
                return;
            }

            $ingredientsToConsume = []; // ingId => ['qty' => float, 'name' => string]

            foreach ($order->items as $item) {
                $recipes = [];

                // Option A: Full Variant BOM
                // If variantId exists, query variant recipes where quantity > 0
                if ($item->variantId) {
                    $recipes = Recipe::where('variantId', $item->variantId)
                        ->where('quantity', '>', 0)
                        ->get()
                        ->toArray();
                }

                // If no variant recipes exist (or item has no variant), fall back to MenuItem recipes where quantity > 0
                if (empty($recipes)) {
                    $recipes = Recipe::where('menuItemId', $item->menuItemId)
                        ->where('quantity', '>', 0)
                        ->get()
                        ->toArray();
                }

                // Addon recipes
                $addonRecipes = [];
                if ($item->addons && count($item->addons) > 0) {
                    $addonIds = $item->addons->pluck('addonId')->toArray();
                    $addonRecipes = Recipe::whereIn('addonId', $addonIds)
                        ->where('quantity', '>', 0)
                        ->get()
                        ->toArray();
                }

                $allRecipes = array_merge($recipes, $addonRecipes);

                foreach ($allRecipes as $r) {
                    $recipeQty = (float)($r['quantity'] ?? 0);
                    if ($recipeQty <= 0) {
                        continue;
                    }

                    $qty = $recipeQty * (int)$item->quantity;
                    $ingId = $r['ingredientId'];

                    if (isset($ingredientsToConsume[$ingId])) {
                        $ingredientsToConsume[$ingId]['qty'] += $qty;
                    } else {
                        $ingredientsToConsume[$ingId] = [
                            'qty' => $qty,
                            'name' => 'Ingredient',
                        ];
                    }
                }
            }

            if (!empty($ingredientsToConsume)) {
                $settings = RestaurantSettings::find('default');
                $allowNegativeStock = $settings ? (bool)$settings->allowNegativeStock : true;

                $ingIds = array_keys($ingredientsToConsume);
                $ingredientsMap = Ingredient::whereIn('id', $ingIds)->lockForUpdate()->get()->keyBy('id');

                $staffIdVal = Staff::where('id', $userId)->value('id') ?? Staff::where('id', $order->createdById)->value('id') ?? Staff::value('id');

                foreach ($ingredientsToConsume as $ingId => $data) {
                    $ingredient = $ingredientsMap->get($ingId);
                    if (!$ingredient) {
                        throw new \Exception("Ingredient not found: {$ingId}", 404);
                    }

                    $qtyToConsume = $data['qty'];
                    $currentStock = (float)$ingredient->currentStock;
                    $balanceAfter = $currentStock - $qtyToConsume;

                    if (!$allowNegativeStock && $balanceAfter < 0) {
                        throw new \Exception("Insufficient stock for ingredient: {$ingredient->name}", 400);
                    }

                    $avgCost = (float)$ingredient->averageCost;
                    $totalCostSnapshot = $qtyToConsume * $avgCost;

                    StockTransaction::create([
                        'id' => (string)Str::uuid(),
                        'ingredientId' => $ingId,
                        'type' => 'RECIPE_CONSUMPTION',
                        'quantityChange' => -$qtyToConsume,
                        'unitCostSnapshot' => $avgCost,
                        'totalCostSnapshot' => -$totalCostSnapshot,
                        'balanceBefore' => $currentStock,
                        'balanceAfter' => $balanceAfter,
                        'averageCostBefore' => $avgCost,
                        'averageCostAfter' => $avgCost,
                        'referenceType' => 'ORDER',
                        'referenceId' => $orderId,
                        'notes' => "Recipe consumption for completed order: {$order->orderNumber}",
                        'changedById' => $staffIdVal,
                        'createdAt' => now(),
                    ]);

                    $ingredient->currentStock = $balanceAfter;
                    $ingredient->save();
                }
            }

            // Record idempotency consumption marker
            OrderStockConsumption::create([
                'id' => (string)Str::uuid(),
                'orderId' => $orderId,
                'consumedAt' => now(),
            ]);

            $order->inventoryDeducted = true;
            $order->save();
        });
    }

    public function reverseStockForCancelledOrder(string $orderId, string $userId): void
    {
        DB::transaction(function () use ($orderId, $userId) {
            // Lock Order row pessimistically
            $order = Order::where('id', $orderId)->lockForUpdate()->first();
            if (!$order) {
                return;
            }

            $hasConsumptionMarker = OrderStockConsumption::where('orderId', $orderId)->exists();
            if (!$order->inventoryDeducted && !$hasConsumptionMarker) {
                return;
            }

            // Check if already reversed
            if (OrderStockConsumptionReversal::where('orderId', $orderId)->exists()) {
                $order->inventoryDeducted = false;
                $order->save();
                return;
            }

            // Retrieve all original RECIPE_CONSUMPTION stock transactions for this order
            $consumptionTxs = StockTransaction::where('referenceType', 'ORDER')
                ->where('referenceId', $orderId)
                ->where('type', 'RECIPE_CONSUMPTION')
                ->get();

            if ($consumptionTxs->count() > 0) {
                $ingIds = $consumptionTxs->pluck('ingredientId')->unique()->toArray();
                $ingredientsMap = Ingredient::whereIn('id', $ingIds)->lockForUpdate()->get()->keyBy('id');

                $staffIdVal = Staff::where('id', $userId)->value('id') ?? Staff::where('id', $order->createdById)->value('id') ?? Staff::value('id');

                foreach ($consumptionTxs as $t) {
                    $ing = $ingredientsMap->get($t->ingredientId);
                    if (!$ing) continue;

                    $qtyToRestore = abs((float)$t->quantityChange);
                    $currentStock = (float)$ing->currentStock;
                    $balanceAfter = $currentStock + $qtyToRestore;
                    $avgCost = (float)$ing->averageCost;
                    $totalCostSnapshot = abs((float)$t->totalCostSnapshot);

                    StockTransaction::create([
                        'id' => (string)Str::uuid(),
                        'ingredientId' => $t->ingredientId,
                        'type' => 'CONSUMPTION_REVERSAL',
                        'quantityChange' => $qtyToRestore,
                        'unitCostSnapshot' => (float)$t->unitCostSnapshot,
                        'totalCostSnapshot' => $totalCostSnapshot,
                        'balanceBefore' => $currentStock,
                        'balanceAfter' => $balanceAfter,
                        'averageCostBefore' => $avgCost,
                        'averageCostAfter' => $avgCost,
                        'referenceType' => 'ORDER',
                        'referenceId' => $orderId,
                        'reversesStockTransactionId' => $t->id,
                        'notes' => "Consumption reversed for voided/cancelled order: {$order->orderNumber}",
                        'changedById' => $staffIdVal,
                        'createdAt' => now(),
                    ]);

                    $ing->currentStock = $balanceAfter;
                    $ing->save();
                }
            }

            // Record idempotency reversal marker
            OrderStockConsumptionReversal::create([
                'id' => (string)Str::uuid(),
                'orderId' => $orderId,
                'reversedAt' => now(),
            ]);

            $order->inventoryDeducted = false;
            $order->save();
        });
    }
}
