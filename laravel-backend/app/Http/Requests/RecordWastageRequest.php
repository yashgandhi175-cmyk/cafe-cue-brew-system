<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RecordWastageRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'ingredientId' => 'required|string|exists:Ingredient,id',
            'quantity' => 'required|numeric|min:0.001',
            'reason' => 'required|string',
            'notes' => 'nullable|string',
        ];
    }
}
