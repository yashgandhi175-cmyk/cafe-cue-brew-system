<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSupplierRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name' => 'nullable|string',
            'contactPerson' => 'nullable|string',
            'phone' => 'nullable|string',
            'email' => 'nullable|email',
            'gstin' => 'nullable|string',
            'address' => 'nullable|string',
            'notes' => 'nullable|string',
        ];
    }
}
