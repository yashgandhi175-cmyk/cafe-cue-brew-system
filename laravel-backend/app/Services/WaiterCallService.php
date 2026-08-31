<?php

namespace App\Services;

use App\Models\WaiterCall;
use App\Models\RestaurantTable;
use Illuminate\Support\Str;

class WaiterCallService
{
    public function createCall(string $tableId): WaiterCall
    {
        $table = RestaurantTable::find($tableId);
        if (!$table || !$table->isActive) {
            throw new \Exception('The selected table is invalid or inactive.', 400);
        }

        return WaiterCall::create([
            'id' => (string)Str::uuid(),
            'tableId' => $tableId,
            'tableNumberSnapshot' => $table->tableNumber,
            'requestedAt' => now(),
        ]);
    }

    public function getActiveWaiterCalls()
    {
        return WaiterCall::with('table')
            ->whereNull('resolvedAt')
            ->orderBy('requestedAt', 'desc')
            ->get();
    }

    public function acknowledgeCall(string $id, string $staffId): WaiterCall
    {
        $call = WaiterCall::find($id);
        if (!$call) {
            throw new \Exception('Waiter call not found', 404);
        }

        $call->acknowledgedAt = now();
        $call->handledById = $staffId;
        $call->save();

        return $call;
    }

    public function resolveCall(string $id, string $staffId): WaiterCall
    {
        $call = WaiterCall::find($id);
        if (!$call) {
            throw new \Exception('Waiter call not found', 404);
        }

        $call->resolvedAt = now();
        $call->handledById = $staffId;
        $call->save();

        return $call;
    }
}
