<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCustomerRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name' => 'nullable|string',
            'email' => 'nullable|email',
            'birthday' => 'nullable|date',
            'anniversary' => 'nullable|date',
            'notes' => 'nullable|string',
            'status' => 'nullable|string|in:ACTIVE,INACTIVE,VIP,BLOCKED',
        ];
    }
}
