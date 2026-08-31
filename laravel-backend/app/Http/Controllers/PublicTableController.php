<?php

namespace App\Http\Controllers;

use App\Services\TableService;

class PublicTableController extends Controller
{
    protected $tableService;

    public function __construct(TableService $tableService)
    {
        $this->tableService = $tableService;
    }

    public function showByToken(string $token)
    {
        try {
            $table = $this->tableService->findByToken($token);
            return response()->json([
                'id' => $table->id,
                'tableNumber' => $table->tableNumber,
                'capacity' => $table->capacity,
                'status' => $table->status,
                'isActive' => (bool)$table->isActive,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Invalid or expired table QR token.',
                'error' => 'Not Found',
                'statusCode' => 404,
            ], 404);
        }
    }
}
