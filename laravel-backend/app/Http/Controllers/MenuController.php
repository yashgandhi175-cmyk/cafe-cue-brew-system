<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MenuService;

class MenuController extends Controller
{
    protected $menuService;

    public function __construct(MenuService $menuService)
    {
        $this->menuService = $menuService;
    }

    // Addons
    public function addons(Request $request)
    {
        $includeInactive = $request->query('all') === 'true';
        return response()->json($this->menuService->findAllAddons($includeInactive));
    }

    public function storeAddon(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'price' => 'required|numeric|min:0',
            'isActive' => 'nullable|boolean',
        ]);

        try {
            return response()->json($this->menuService->createAddon($data), 201);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function updateAddon(Request $request, string $id)
    {
        $data = $request->validate([
            'name' => 'nullable|string|max:255',
            'price' => 'nullable|numeric|min:0',
            'isActive' => 'nullable|boolean',
        ]);

        try {
            return response()->json($this->menuService->updateAddon($id, $data));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function destroyAddon(string $id)
    {
        try {
            return response()->json($this->menuService->removeAddon($id));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    // Menu Items
    public function index(Request $request)
    {
        $categoryId = $request->query('categoryId');
        $includeInactive = $request->query('all') === 'true';
        return response()->json($this->menuService->findAllMenuItems($categoryId, $includeInactive));
    }

    public function show(string $id)
    {
        try {
            return response()->json($this->menuService->findOneMenuItem($id));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'categoryId' => 'required|string|exists:Category,id',
            'basePrice' => 'required|numeric|min:0',
            'description' => 'nullable|string',
            'image' => 'nullable|string',
            'isVeg' => 'nullable|boolean',
            'available' => 'nullable|boolean',
            'popular' => 'nullable|boolean',
            'recommended' => 'nullable|boolean',
            'bestSeller' => 'nullable|boolean',
            'isActive' => 'nullable|boolean',
            'variants' => 'nullable|array',
            'variants.*.name' => 'required_with:variants|string',
            'variants.*.price' => 'required_with:variants|numeric|min:0',
            'addonIds' => 'nullable|array',
            'addonIds.*' => 'string|exists:Addon,id',
        ]);

        try {
            return response()->json($this->menuService->createMenuItem($data), 201);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function update(Request $request, string $id)
    {
        $data = $request->validate([
            'name' => 'nullable|string|max:255',
            'categoryId' => 'nullable|string|exists:Category,id',
            'basePrice' => 'nullable|numeric|min:0',
            'description' => 'nullable|string',
            'image' => 'nullable|string',
            'isVeg' => 'nullable|boolean',
            'available' => 'nullable|boolean',
            'popular' => 'nullable|boolean',
            'recommended' => 'nullable|boolean',
            'bestSeller' => 'nullable|boolean',
            'isActive' => 'nullable|boolean',
            'addonIds' => 'nullable|array',
            'addonIds.*' => 'string|exists:Addon,id',
        ]);

        try {
            return response()->json($this->menuService->updateMenuItem($id, $data));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function destroy(string $id)
    {
        try {
            return response()->json($this->menuService->removeMenuItem($id));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function bulkPriceUpdate(Request $request)
    {
        $data = $request->validate([
            'updateType' => 'required|string|in:PERCENTAGE,FLAT',
            'action' => 'required|string|in:INCREASE,DECREASE',
            'value' => 'required|numeric|gt:0',
            'categoryId' => 'nullable|string|exists:Category,id',
        ]);

        try {
            return response()->json($this->menuService->bulkPriceUpdate($data));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }
}
