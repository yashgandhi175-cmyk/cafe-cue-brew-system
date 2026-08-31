<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePurchaseRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'supplierId' => 'nullable|string|exists:Supplier,id',
            'invoiceNumber' => 'nullable|string',
            'invoiceDate' => 'nullable|date',
            'purchaseDate' => 'nullable|date',
            'discount' => 'nullable|numeric|min:0',
            'tax' => 'nullable|numeric|min:0',
            'otherCharges' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'items' => 'nullable|array|min:1',
            'items.*.ingredientId' => 'required|string|exists:Ingredient,id',
            'items.*.purchaseUnit' => 'required|string',
            'items.*.purchaseQuantity' => 'required|numeric|min:0.001',
            'items.*.conversionFactor' => 'required|numeric|min:0.001',
            'items.*.unitPurchaseCost' => 'required|numeric|min:0',
            'items.*.tax' => 'nullable|numeric|min:0',
        ];
    }
}
