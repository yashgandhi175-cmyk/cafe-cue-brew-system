<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSupplierRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name' => 'required|string',
            'contactPerson' => 'nullable|string',
            'phone' => 'required|string',
            'email' => 'nullable|email',
            'gstin' => 'nullable|string',
            'address' => 'nullable|string',
            'notes' => 'nullable|string',
        ];
    }
}
