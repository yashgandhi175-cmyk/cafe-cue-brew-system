<?php

namespace App\Services;

use App\Models\Expense;
use App\Models\Staff;
use App\Models\RestaurantSettings;
use App\Models\AuditLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ExpenseService
{
    public function checkPermission(string $userId, string $capability): void
    {
        $staff = Staff::find($userId);
        if (!$staff) {
            throw new \Exception('Staff member not found.', 401);
        }
        if ($staff->role === 'OWNER') {
            return;
        }
        if ($staff->role === 'MANAGER') {
            $settings = RestaurantSettings::find('default');
            if ($settings && !empty($settings->$capability)) {
                return;
            }
        }
        throw new \Exception('You do not have permission to perform this action.', 403);
    }

    public function createExpense(array $dto, string $userId): Expense
    {
        $this->checkPermission($userId, 'managerCanManageExpenses');
        return Expense::create([
            'id' => (string)Str::uuid(),
            'expenseDate' => $dto['expenseDate'],
            'category' => $dto['category'],
            'title' => $dto['title'],
            'amount' => (float)$dto['amount'],
            'paymentMethod' => $dto['paymentMethod'] ?? null,
            'referenceNumber' => $dto['referenceNumber'] ?? null,
            'status' => 'ACTIVE',
            'notes' => $dto['notes'] ?? null,
            'createdById' => $userId,
            'createdAt' => now(),
        ]);
    }

    public function findAllExpenses(string $userId): array
    {
        try {
            $this->checkPermission($userId, 'managerCanManageExpenses');
        } catch (\Exception $e) {
            $this->checkPermission($userId, 'managerCanViewProfitEstimate');
        }

        return Expense::with('createdBy:id,name,role')
            ->orderBy('expenseDate', 'desc')
            ->get()
            ->toArray();
    }

    public function findOneExpense(string $id, string $userId): Expense
    {
        try {
            $this->checkPermission($userId, 'managerCanManageExpenses');
        } catch (\Exception $e) {
            $this->checkPermission($userId, 'managerCanViewProfitEstimate');
        }

        $expense = Expense::with('createdBy:id,name,role')->find($id);
        if (!$expense) {
            throw new \Exception('Expense not found.', 404);
        }
        return $expense;
    }

    public function updateExpense(string $id, array $dto, string $userId): Expense
    {
        $this->checkPermission($userId, 'managerCanManageExpenses');
        $expense = Expense::find($id);
        if (!$expense) {
            throw new \Exception('Expense not found.', 404);
        }
        if ($expense->status === 'VOIDED') {
            throw new \Exception('Voided expenses cannot be updated.', 400);
        }

        if (isset($dto['expenseDate'])) $expense->expenseDate = $dto['expenseDate'];
        if (isset($dto['category'])) $expense->category = $dto['category'];
        if (isset($dto['title'])) $expense->title = $dto['title'];
        if (isset($dto['amount'])) $expense->amount = (float)$dto['amount'];
        if (array_key_exists('paymentMethod', $dto)) $expense->paymentMethod = $dto['paymentMethod'];
        if (array_key_exists('referenceNumber', $dto)) $expense->referenceNumber = $dto['referenceNumber'];
        if (array_key_exists('notes', $dto)) $expense->notes = $dto['notes'];

        $expense->save();
        return $expense;
    }

    public function deleteExpense(string $id, string $userId): bool
    {
        $this->checkPermission($userId, 'managerCanManageExpenses');
        $expense = Expense::find($id);
        if (!$expense) {
            throw new \Exception('Expense not found.', 404);
        }
        return (bool)$expense->delete();
    }

    public function voidExpense(string $id, array $dto, string $userId): Expense
    {
        $this->checkPermission($userId, 'managerCanManageExpenses');
        $expense = Expense::find($id);
        if (!$expense) {
            throw new \Exception('Expense not found.', 404);
        }
        if ($expense->status === 'VOIDED') {
            throw new \Exception('Expense is already voided.', 400);
        }

        $expense->status = 'VOIDED';
        $expense->voidReason = $dto['voidReason'];
        $expense->save();

        return $expense;
    }

    private function sanitizeCsvCell(mixed $val): string
    {
        if ($val === null || $val === '') return '';
        $str = (string)$val;
        if (str_starts_with($str, '=') || str_starts_with($str, '+') || str_starts_with($str, '-') || str_starts_with($str, '@')) {
            $str = "'" . $str;
        }
        return $str;
    }

    public function exportExpensesCsv(string $userId): string
    {
        $list = $this->findAllExpenses($userId);
        $headers = [
            'Expense ID', 'Expense Date', 'Category', 'Title', 'Amount',
            'Payment Method', 'Reference Number', 'Status', 'Void Reason',
            'Notes', 'Created By', 'Created At'
        ];

        $rows = array_map(fn($e) => [
            $e['id'],
            date('Y-m-d', strtotime($e['expenseDate'])),
            $e['category'],
            $e['title'],
            $e['amount'],
            $e['paymentMethod'] ?? '',
            $e['referenceNumber'] ?? '',
            $e['status'],
            $e['voidReason'] ?? '',
            $e['notes'] ?? '',
            $e['created_by']['name'] ?? $e['createdBy']['name'] ?? '',
            date('Y-m-d H:i:s', strtotime($e['createdAt'])),
        ], $list);

        $content = [
            implode(',', array_map(fn($h) => '"' . $this->sanitizeCsvCell($h) . '"', $headers))
        ];
        foreach ($rows as $row) {
            $content[] = implode(',', array_map(fn($cell) => '"' . $this->sanitizeCsvCell($cell) . '"', $row));
        }

        return implode("
", $content);
    }
}
