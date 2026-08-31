<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReconcileStockCountRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'items' => 'required|array|min:1',
            'items.*.ingredientId' => 'required|string|exists:Ingredient,id',
            'items.*.physicalCount' => 'required|numeric',
        ];
    }
}
