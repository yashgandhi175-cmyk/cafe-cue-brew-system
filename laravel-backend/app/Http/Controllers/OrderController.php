<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\OrderService;

class OrderController extends Controller
{
    protected $orderService;

    public function __construct(OrderService $orderService)
    {
        $this->orderService = $orderService;
    }

    public function createPosOrder(Request $request)
    {
        $data = $request->validate([
            'orderType' => 'required|string|in:DINE_IN,TAKEAWAY',
            'tableId' => 'nullable|string',
            'customerName' => 'nullable|string',
            'customerPhone' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.menuItemId' => 'required|string|exists:MenuItem,id',
            'items.*.variantId' => 'nullable|string',
            'items.*.addonIds' => 'nullable|array',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.notes' => 'nullable|string',
            'manualDiscountType' => 'nullable|string|in:FLAT,PERCENTAGE',
            'manualDiscountValue' => 'nullable|numeric|min:0',
            'idempotencyKey' => 'nullable|string',
            'marketingConsent' => 'nullable|boolean',
            'notes' => 'nullable|string',
        ]);

        $staff = $request->attributes->get('auth_staff');

        try {
            return response()->json($this->orderService->createPosOrder($staff->id, $staff->role, $data), 201);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function getLiveOrders()
    {
        return response()->json($this->orderService->getLiveOrders());
    }

    public function index(Request $request)
    {
        $filters = [
            'page' => $request->query('page'),
            'limit' => $request->query('limit'),
            'status' => $request->query('status'),
            'paymentStatus' => $request->query('paymentStatus'),
            'source' => $request->query('source'),
            'tableId' => $request->query('tableId'),
            'search' => $request->query('search'),
            'startDate' => $request->query('startDate'),
            'endDate' => $request->query('endDate'),
        ];

        return response()->json($this->orderService->getOrders($filters));
    }

    public function show(string $id)
    {
        try {
            return response()->json($this->orderService->getOrderById($id));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 404;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function updateStatus(Request $request, string $id)
    {
        $data = $request->validate([
            'status' => 'required|string',
            'override' => 'nullable|boolean',
            'overrideReason' => 'nullable|string',
        ]);

        $staff = $request->attributes->get('auth_staff');

        try {
            return response()->json($this->orderService->updateOrderStatus(
                $id,
                $data['status'],
                $staff->id ?? 'system',
                $staff->role ?? 'WAITER',
                (bool)($data['override'] ?? false),
                $data['overrideReason'] ?? null
            ));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function cancel(Request $request, string $id)
    {
        $data = $request->validate([
            'reason' => 'required|string',
            'customReason' => 'nullable|string',
        ]);

        $staff = $request->attributes->get('auth_staff');

        try {
            return response()->json($this->orderService->cancelOrder(
                $id,
                $data['reason'],
                $data['customReason'] ?? null,
                $staff->id ?? 'system',
                $staff->role ?? 'MANAGER'
            ));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function void(Request $request, string $id)
    {
        $data = $request->validate([
            'reason' => 'required|string',
        ]);

        $staff = $request->attributes->get('auth_staff');

        try {
            return response()->json($this->orderService->voidOrder(
                $id,
                $data['reason'],
                $staff->id ?? 'system',
                $staff->role ?? 'OWNER'
            ));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }
}
