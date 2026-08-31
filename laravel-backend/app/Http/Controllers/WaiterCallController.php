<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\WaiterCallService;

class WaiterCallController extends Controller
{
    protected $waiterCallService;

    public function __construct(WaiterCallService $waiterCallService)
    {
        $this->waiterCallService = $waiterCallService;
    }

    public function store(string $tableId)
    {
        try {
            $call = $this->waiterCallService->createCall($tableId);
            return response()->json($call, 201);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function index()
    {
        return response()->json($this->waiterCallService->getActiveWaiterCalls());
    }

    public function updateStatus(Request $request, string $id)
    {
        $request->validate([
            'status' => 'required|string|in:ACKNOWLEDGED,RESOLVED',
        ]);

        $staff = $request->attributes->get('auth_staff');
        $status = $request->input('status');

        try {
            if ($status === 'ACKNOWLEDGED') {
                return response()->json($this->waiterCallService->acknowledgeCall($id, $staff->id));
            } else {
                return response()->json($this->waiterCallService->resolveCall($id, $staff->id));
            }
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function acknowledge(Request $request, string $id)
    {
        $staff = $request->attributes->get('auth_staff');
        try {
            return response()->json($this->waiterCallService->acknowledgeCall($id, $staff->id));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function resolve(Request $request, string $id)
    {
        $staff = $request->attributes->get('auth_staff');
        try {
            return response()->json($this->waiterCallService->resolveCall($id, $staff->id));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }
}
