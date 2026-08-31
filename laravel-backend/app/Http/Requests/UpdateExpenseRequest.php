<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateExpenseRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'expenseDate' => 'nullable|date',
            'category' => 'nullable|string',
            'title' => 'nullable|string',
            'amount' => 'nullable|numeric|min:0.01',
            'paymentMethod' => 'nullable|string',
            'referenceNumber' => 'nullable|string',
            'notes' => 'nullable|string',
        ];
    }
}
