<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\TableService;

class TableController extends Controller
{
    protected $tableService;

    public function __construct(TableService $tableService)
    {
        $this->tableService = $tableService;
    }

    public function index(Request $request)
    {
        $includeInactive = $request->query('all') === 'true';
        return response()->json($this->tableService->findAll($includeInactive));
    }

    public function show(string $id)
    {
        try {
            return response()->json($this->tableService->findOne($id));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'tableNumber' => 'required|string|max:50|unique:RestaurantTable,tableNumber',
            'capacity' => 'nullable|integer|min:1',
            'status' => 'nullable|string',
            'isActive' => 'nullable|boolean',
        ]);

        try {
            return response()->json($this->tableService->create($data), 201);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function update(Request $request, string $id)
    {
        $data = $request->validate([
            'tableNumber' => 'nullable|string|max:50|unique:RestaurantTable,tableNumber,' . $id . ',id',
            'capacity' => 'nullable|integer|min:1',
            'status' => 'nullable|string',
            'isActive' => 'nullable|boolean',
        ]);

        try {
            return response()->json($this->tableService->update($id, $data));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function destroy(string $id)
    {
        try {
            return response()->json($this->tableService->delete($id));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function generateQrToken(string $id)
    {
        try {
            return response()->json($this->tableService->regenerateQrToken($id));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function shiftTable(Request $request)
    {
        $data = $request->validate([
            'sourceTableId' => 'required|string|exists:RestaurantTable,id',
            'targetTableId' => 'required|string|exists:RestaurantTable,id',
        ]);

        $staff = $request->attributes->get('auth_staff');

        try {
            return response()->json($this->tableService->shiftTable($data['sourceTableId'], $data['targetTableId'], $staff->id ?? null));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function mergeTables(Request $request)
    {
        $data = $request->validate([
            'primaryTableId' => 'required|string|exists:RestaurantTable,id',
            'secondaryTableIds' => 'required|array',
            'secondaryTableIds.*' => 'string|exists:RestaurantTable,id',
        ]);

        $staff = $request->attributes->get('auth_staff');

        try {
            return response()->json($this->tableService->mergeTables($data['primaryTableId'], $data['secondaryTableIds'], $staff->id ?? null));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }
}
