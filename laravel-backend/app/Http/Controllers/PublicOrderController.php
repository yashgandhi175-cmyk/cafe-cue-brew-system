<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\PublicOrderService;

class PublicOrderController extends Controller
{
    protected $publicOrderService;

    public function __construct(PublicOrderService $publicOrderService)
    {
        $this->publicOrderService = $publicOrderService;
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'tableId' => 'required|string|exists:RestaurantTable,id',
            'token' => 'required|string',
            'customerName' => 'required|string',
            'customerPhone' => 'required|string',
            'items' => 'required|array|min:1',
            'items.*.menuItemId' => 'required|string|exists:MenuItem,id',
            'items.*.variantId' => 'nullable|string',
            'items.*.addonIds' => 'nullable|array',
            'items.*.quantity' => 'required|integer|min:1',
            'couponCode' => 'nullable|string|max:100',
            'idempotencyKey' => 'nullable|string',
            'marketingConsent' => 'nullable|boolean',
        ]);

        try {
            return response()->json($this->publicOrderService->createPublicOrder($data), 201);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function track(string $trackingToken)
    {
        try {
            return response()->json($this->publicOrderService->getOrderTrackingDetails($trackingToken));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function activeToken(Request $request, string $tableId)
    {
        $token = $request->query('token');
        if (!$token) {
            return response()->json(['message' => 'Table QR token is required.', 'statusCode' => 422], 422);
        }

        try {
            return response()->json($this->publicOrderService->getActiveTrackingTokenForTable($tableId, $token));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function getCart(Request $request, string $tableId)
    {
        $token = $request->query('token');
        if (!$token) {
            return response()->json(['message' => 'Table QR token is required.', 'statusCode' => 422], 422);
        }

        try {
            return response()->json($this->publicOrderService->getCart($tableId, $token));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function updateCart(Request $request, string $tableId)
    {
        $data = $request->validate([
            'token' => 'required|string',
            'menuItemId' => 'required|string|exists:MenuItem,id',
            'variantId' => 'nullable|string',
            'addonIds' => 'nullable|array',
            'quantity' => 'required|integer',
            'notes' => 'nullable|string',
        ]);

        try {
            return response()->json($this->publicOrderService->updateCartItem(
                $tableId,
                $data['token'],
                $data['menuItemId'],
                $data['variantId'] ?? null,
                $data['addonIds'] ?? [],
                (int)$data['quantity'],
                $data['notes'] ?? null
            ));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function syncCart(Request $request, string $tableId)
    {
        $data = $request->validate([
            'token' => 'required|string',
            'items' => 'required|array',
            'items.*.menuItemId' => 'required|string|exists:MenuItem,id',
            'items.*.variantId' => 'nullable|string',
            'items.*.quantity' => 'required|integer',
            'items.*.notes' => 'nullable|string',
        ]);

        try {
            return response()->json($this->publicOrderService->syncCart($tableId, $data['token'], $data['items']));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function clearCart(Request $request, string $tableId)
    {
        $data = $request->validate([
            'token' => 'required|string',
        ]);

        try {
            return response()->json($this->publicOrderService->clearCart($tableId, $data['token']));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }
}
