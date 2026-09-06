<?php

namespace App\Services;

use App\Models\RestaurantTable;
use App\Models\TableQrToken;
use App\Models\TableSession;
use App\Models\WaiterCall;
use App\Models\CustomerCart;
use App\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TableService
{
    public function findAll(bool $includeInactive = false)
    {
        $query = RestaurantTable::with('qrToken');
        if (!$includeInactive) {
            $query->where('isActive', true);
        }
        return $query->orderBy('tableNumber')->get();
    }

    public function findOne(string $id): RestaurantTable
    {
        $table = RestaurantTable::with('qrToken')->find($id);
        if (!$table) {
            throw new \Exception('Table not found', 404);
        }
        return $table;
    }

    public function findByToken(string $token): RestaurantTable
    {
        $qrToken = TableQrToken::where('token', $token)->with('table')->first();
        if (!$qrToken || !$qrToken->table || !$qrToken->table->isActive) {
            throw new \Exception('Invalid or expired table QR token.', 404);
        }
        return $qrToken->table;
    }

    public function create(array $data): RestaurantTable
    {
        return DB::transaction(function () use ($data) {
            $tableId = (string)Str::uuid();
            $table = RestaurantTable::create([
                'id' => $tableId,
                'tableNumber' => trim($data['tableNumber']),
                'capacity' => isset($data['capacity']) ? (int)$data['capacity'] : 4,
                'status' => $data['status'] ?? 'AVAILABLE',
                'isActive' => isset($data['isActive']) ? (bool)$data['isActive'] : true,
            ]);

            $rawToken = 'CCB_TBL_' . strtoupper(Str::random(16));
            TableQrToken::create([
                'id' => (string)Str::uuid(),
                'tableId' => $tableId,
                'token' => $rawToken,
                'createdAt' => now(),
            ]);

            return $this->findOne($tableId);
        });
    }

    public function update(string $id, array $data): RestaurantTable
    {
        $table = RestaurantTable::find($id);
        if (!$table) {
            throw new \Exception('Table not found', 404);
        }

        if (isset($data['tableNumber'])) $table->tableNumber = trim($data['tableNumber']);
        if (isset($data['capacity'])) $table->capacity = (int)$data['capacity'];
        if (isset($data['status'])) $table->status = $data['status'];
        if (isset($data['isActive'])) $table->isActive = (bool)$data['isActive'];

        $table->save();
        return $this->findOne($id);
    }

    public function delete(string $id): array
{
    return DB::transaction(function () use ($id) {
        $table = RestaurantTable::where('id', $id)
            ->lockForUpdate()
            ->first();

        if (!$table) {
            throw new \Exception('Table not found', 404);
        }

        // Preserve tables that have historical orders.
        $hasOrders = Order::where('tableId', $id)->exists();

        if ($hasOrders) {
            $table->isActive = false;
            $table->save();

            return [
                'message' => "Table {$table->tableNumber} has historical orders and was safely deactivated.",
                'action' => 'deactivated'
            ];
        }

        // Clean up transient table associations before physical deletion.
        TableQrToken::where('tableId', $id)->delete();
        TableSession::where('tableId', $id)->delete();
        WaiterCall::where('tableId', $id)->delete();
        CustomerCart::where('tableId', $id)->delete();

        $tableNumber = $table->tableNumber;
        $table->delete();

        return [
            'message' => "Table {$tableNumber} deleted successfully.",
            'action' => 'deleted'
        ];
    });
}


    public function regenerateQrToken(string $id): array
    {
        $table = RestaurantTable::find($id);
        if (!$table) {
            throw new \Exception('Table not found', 404);
        }

        $newToken = 'CCB_TBL_' . strtoupper(Str::random(16));
        TableQrToken::updateOrCreate(
            ['tableId' => $id],
            [
                'id' => (string)Str::uuid(),
                'token' => $newToken,
                'createdAt' => now(),
            ]
        );

        return ['token' => $newToken, 'tableId' => $id];
    }

    public function shiftTable(string $sourceTableId, string $targetTableId, ?string $staffId = null): array
    {
        return DB::transaction(function () use ($sourceTableId, $targetTableId) {
            if ($sourceTableId === $targetTableId) {
                throw new \Exception('Source and target tables must be different.', 422);
            }

            $tables = RestaurantTable::whereIn('id', [$sourceTableId, $targetTableId])
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $source = $tables->get($sourceTableId);
            $target = $tables->get($targetTableId);

            if (!$source || !$target) {
                throw new \Exception('Source or target table not found.', 404);
            }

            if (!$source->isActive || !$target->isActive) {
                throw new \Exception('Source and target tables must be active.', 422);
            }

            Order::where('tableId', $sourceTableId)
                ->whereIn('status', ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY'])
                ->update(['tableId' => $targetTableId]);

            $source->status = 'AVAILABLE';
            $source->save();

            $target->status = 'OCCUPIED';
            $target->save();

            return ['message' => "Orders shifted from table {$source->tableNumber} to {$target->tableNumber} successfully."];
        });
    }

    public function mergeTables(string $primaryTableId, array $secondaryTableIds, ?string $staffId = null): array
    {
        return DB::transaction(function () use ($primaryTableId, $secondaryTableIds) {
            $secondaryTableIds = array_values(array_unique($secondaryTableIds));

            if (empty($secondaryTableIds)) {
                throw new \Exception('At least one secondary table is required.', 422);
            }

            if (in_array($primaryTableId, $secondaryTableIds, true)) {
                throw new \Exception('Primary table cannot be included in secondary tables.', 422);
            }

            $allTableIds = array_values(array_unique(
                array_merge([$primaryTableId], $secondaryTableIds)
            ));

            $tables = RestaurantTable::whereIn('id', $allTableIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            if ($tables->count() !== count($allTableIds)) {
                throw new \Exception('One or more tables were not found.', 404);
            }

            foreach ($allTableIds as $tableId) {
                if (!$tables->get($tableId)->isActive) {
                    throw new \Exception('All tables must be active.', 422);
                }
            }

            $primary = $tables->get($primaryTableId);

            Order::whereIn('tableId', $secondaryTableIds)
                ->whereIn('status', ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY'])
                ->update(['tableId' => $primaryTableId]);

            RestaurantTable::whereIn('id', $secondaryTableIds)
                ->update(['status' => 'AVAILABLE']);

            $primary->status = 'OCCUPIED';
            $primary->save();

            return ['message' => "Tables merged into primary table {$primary->tableNumber} successfully."];
        });
    }
}
