<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreExpenseRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'expenseDate' => 'required|date',
            'category' => 'required|string',
            'title' => 'required|string',
            'amount' => 'required|numeric|min:0.01',
            'paymentMethod' => 'nullable|string',
            'referenceNumber' => 'nullable|string',
            'notes' => 'nullable|string',
        ];
    }
}
