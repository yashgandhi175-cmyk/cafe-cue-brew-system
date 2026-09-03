<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\TableService;

class PublicTableController extends Controller
{
    protected $tableService;

    public function __construct(TableService $tableService)
    {
        $this->tableService = $tableService;
    }

    public function showByToken(Request $request, ?string $token = null)
    {
        try {
            $rawToken = ($token && $token !== 'validate') ? $token : $request->query('token');
            if (!$rawToken) {
                throw new \Exception('Invalid or expired table QR token.', 404);
            }
            $table = $this->tableService->findByToken($rawToken);
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
