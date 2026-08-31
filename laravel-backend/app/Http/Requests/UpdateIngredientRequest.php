<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateIngredientRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name' => 'nullable|string',
            'sku' => 'nullable|string',
            'unit' => 'nullable|string',
            'category' => 'nullable|string',
            'minimumStock' => 'nullable|numeric|min:0',
            'reorderLevel' => 'nullable|numeric|min:0',
            'preferredSupplierId' => 'nullable|string|exists:Supplier,id',
        ];
    }
}
