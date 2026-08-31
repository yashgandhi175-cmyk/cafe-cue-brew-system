<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateRecipeRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'menuItemId' => 'nullable|string|exists:MenuItem,id',
            'variantId' => 'nullable|string|exists:MenuVariant,id',
            'addonId' => 'nullable|string|exists:Addon,id',
            'ingredientId' => 'nullable|string|exists:Ingredient,id',
            'quantity' => 'nullable|numeric|min:0.001',
        ];
    }
}
