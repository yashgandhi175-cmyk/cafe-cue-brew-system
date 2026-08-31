<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AdjustStockRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'ingredientId' => 'required|string|exists:Ingredient,id',
            'quantityChange' => 'required|numeric',
            'type' => 'required|string|in:ADJUSTMENT_IN,ADJUSTMENT_OUT',
            'reason' => 'nullable|string',
        ];
    }
}
