<?php

namespace App\Services;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderItemAddon;
use App\Models\OrderStatusHistory;
use App\Models\RestaurantTable;
use App\Models\RestaurantSettings;
use App\Models\Customer;
use App\Models\CustomerCart;
use App\Models\CustomerCartItem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PublicOrderService
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
        $order->loadMissing(['items.addons', 'table']);
        return [
            'id' => $order->id,
            'orderNumber' => $order->orderNumber,
            'tableId' => $order->tableId,
            'tableNumber' => $order->table ? $order->table->tableNumber : null,
            'customerName' => $order->customerName,
            'customerPhone' => $order->customerPhone,
            'orderType' => $order->orderType,
            'status' => $order->status,
            'paymentStatus' => $order->paymentStatus,
            'trackingToken' => $order->publicTrackingToken,
            'subtotal' => (float)$order->subtotal,
            'discount' => (float)$order->discount,
            'taxableAmount' => (float)$order->taxableAmount,
            'cgst' => (float)$order->cgst,
            'sgst' => (float)$order->sgst,
            'grandTotal' => (float)$order->grandTotal,
            'createdAt' => $order->createdAt,
            'items' => $order->items->map(function ($item) {
                return [
                    'id' => $item->id,
                    'menuItemId' => $item->menuItemId,
                    'nameSnapshot' => $item->nameSnapshot,
                    'variantId' => $item->variantId,
                    'variantNameSnapshot' => $item->variantNameSnapshot,
                    'priceSnapshot' => (float)$item->priceSnapshot,
                    'quantity' => (int)$item->quantity,
                    'totalPrice' => (float)$item->totalPrice,
                    'notes' => $item->notes,
                    'addons' => $item->addons->map(function ($a) {
                        return [
                            'addonId' => $a->addonId,
                            'nameSnapshot' => $a->nameSnapshot,
                            'priceSnapshot' => (float)$a->priceSnapshot,
                        ];
                    }),
                ];
            }),
        ];
    }

    public function createPublicOrder(array $dto): array
    {
        $idempotencyKey = $dto['idempotencyKey'] ?? null;
        if ($idempotencyKey) {
            $existing = Order::where('idempotencyKey', $idempotencyKey)->first();
            if ($existing) {
                return $this->sanitizeOrderResponse($existing);
            }
        }

        $table = RestaurantTable::with('qrToken')->find($dto['tableId'] ?? '');
        if (!$table || !$table->isActive) {
            throw new \Exception('The selected table is inactive or does not exist.', 400);
        }

        if (!$table->qrToken || $table->qrToken->token !== ($dto['token'] ?? '')) {
            throw new \Exception('Invalid or expired table QR token.', 400);
        }

        $settings = RestaurantSettings::find('default');
        if (!$settings) {
            throw new \Exception('Restaurant configuration settings not found.', 400);
        }

        if (!$settings->qrOrderingEnabled) {
            throw new \Exception('QR ordering is currently disabled by the restaurant.', 400);
        }

        $customerName = trim($dto['customerName'] ?? '');
        $customerPhone = trim($dto['customerPhone'] ?? '');

        if ($settings->requireCustomerName && empty($customerName)) {
            throw new \Exception('Customer Name is required.', 400);
        }
        if ($settings->requireCustomerPhone && empty($customerPhone)) {
            throw new \Exception('Customer Phone Number is required.', 400);
        }

        $finalPhone = $this->normalizePhone($customerPhone);

        // Re-fetch database prices using CartPricingService
        $cartResult = $this->cartPricingService->resolveAndValidateCart($dto['items'] ?? []);
        $calcResult = $this->financialCalcService->calculate([
            'subtotal' => $cartResult['subtotal'],
            'manualDiscount' => 0,
            'couponDiscount' => 0,
            'settings' => $settings,
        ]);

        return DB::transaction(function () use ($dto, $idempotencyKey, $table, $customerName, $finalPhone, $cartResult, $calcResult) {
            // Find or create Customer
            $customer = Customer::where('phone', $finalPhone)->first();
            if ($customer) {
                $customer->name = $customerName;
                $customer->marketingConsent = (bool)($dto['marketingConsent'] ?? false);
                $customer->visitCount += 1;
                $customer->save();
            } else {
                $customer = Customer::create([
                    'id' => (string)Str::uuid(),
                    'name' => $customerName,
                    'phone' => $finalPhone,
                    'marketingConsent' => (bool)($dto['marketingConsent'] ?? false),
                    'visitCount' => 1,
                ]);
            }

            $trackingToken = 'TRK_' . strtoupper(Str::random(16));
            $orderNumber = date('Ymd') . rand(1000, 9999);

            $order = Order::create([
                'id' => (string)Str::uuid(),
                'orderNumber' => $orderNumber,
                'orderType' => 'DINE_IN',
                'source' => 'QR',
                'status' => 'RECEIVED',
                'paymentStatus' => 'UNPAID',
                'idempotencyKey' => $idempotencyKey,
                'publicTrackingToken' => $trackingToken,
                'tableId' => $table->id,
                'customerId' => $customer->id,
                'customerName' => $customerName,
                'customerPhone' => $finalPhone,
                'subtotal' => $calcResult['subtotal'],
                'discount' => $calcResult['discount'],
                'taxableAmount' => $calcResult['taxableAmount'],
                'cgst' => $calcResult['cgst'],
                'sgst' => $calcResult['sgst'],
                'roundOff' => $calcResult['roundOff'],
                'grandTotal' => $calcResult['grandTotal'],
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
                'status' => 'RECEIVED',
                'notes' => 'Public QR order submitted by customer',
                'changedAt' => now(),
            ]);

            $table->status = 'OCCUPIED';
            $table->save();

            // Clear table cart
            $this->clearCart($table->id);

            return $this->sanitizeOrderResponse($order);
        });
    }

    public function getOrderTrackingDetails(string $trackingToken): array
    {
        $order = Order::where('publicTrackingToken', $trackingToken)
            ->orWhere('id', $trackingToken)
            ->with(['items.addons', 'table'])
            ->first();

        if (!$order) {
            throw new \Exception('Order not found or invalid tracking token.', 404);
        }

        return $this->sanitizeOrderResponse($order);
    }

    public function getActiveTrackingTokenForTable(string $tableId): array
    {
        $order = Order::where('tableId', $tableId)
            ->whereIn('status', ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY'])
            ->orderBy('createdAt', 'desc')
            ->first();

        return [
            'trackingToken' => $order ? $order->publicTrackingToken : null,
            'orderId' => $order ? $order->id : null,
            'status' => $order ? $order->status : null,
        ];
    }

    // Cart management
    public function getCart(string $tableId): array
    {
        $cart = CustomerCart::where('tableId', $tableId)->with('items')->first();
        return [
            'tableId' => $tableId,
            'items' => $cart ? $cart->items : [],
        ];
    }

    public function updateCartItem(string $tableId, string $menuItemId, ?string $variantId, array $addonIds, int $quantity, ?string $notes = null): array
    {
        $cart = CustomerCart::firstOrCreate(
            ['tableId' => $tableId],
            ['id' => (string)Str::uuid()]
        );

        if ($quantity <= 0) {
            CustomerCartItem::where('cartId', $cart->id)
                ->where('menuItemId', $menuItemId)
                ->where('variantId', $variantId)
                ->delete();
        } else {
            CustomerCartItem::updateOrCreate(
                ['cartId' => $cart->id, 'menuItemId' => $menuItemId, 'variantId' => $variantId],
                ['id' => (string)Str::uuid(), 'quantity' => $quantity, 'notes' => $notes]
            );
        }

        return $this->getCart($tableId);
    }

    public function syncCart(string $tableId, array $items): array
    {
        $cart = CustomerCart::firstOrCreate(
            ['tableId' => $tableId],
            ['id' => (string)Str::uuid()]
        );

        CustomerCartItem::where('cartId', $cart->id)->delete();

        foreach ($items as $i) {
            if (($i['quantity'] ?? 0) > 0) {
                CustomerCartItem::create([
                    'id' => (string)Str::uuid(),
                    'cartId' => $cart->id,
                    'menuItemId' => $i['menuItemId'],
                    'variantId' => $i['variantId'] ?? null,
                    'quantity' => (int)$i['quantity'],
                    'notes' => $i['notes'] ?? null,
                ]);
            }
        }

        return $this->getCart($tableId);
    }

    public function clearCart(string $tableId): array
    {
        $cart = CustomerCart::where('tableId', $tableId)->first();
        if ($cart) {
            CustomerCartItem::where('cartId', $cart->id)->delete();
        }
        return ['message' => 'Cart cleared successfully'];
    }
}
