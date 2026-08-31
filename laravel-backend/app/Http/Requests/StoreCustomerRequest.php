<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCustomerRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name' => 'required|string',
            'phone' => 'required|string',
            'email' => 'nullable|email',
            'birthday' => 'nullable|date',
            'anniversary' => 'nullable|date',
            'notes' => 'nullable|string',
            'marketingConsent' => 'nullable|boolean',
        ];
    }
}
