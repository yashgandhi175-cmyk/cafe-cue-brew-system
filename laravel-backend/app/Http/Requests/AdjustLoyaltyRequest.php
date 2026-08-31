<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AdjustLoyaltyRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'pointsChange' => 'required|integer',
            'reason' => 'required|string',
            'idempotencyKey' => 'required|string',
        ];
    }
}
