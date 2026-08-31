<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCampaignRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'type' => 'required|string|in:WHATSAPP,EMAIL,SMS,PUSH',
            'templateId' => 'required|string',
            'templateVariables' => 'nullable|array',
            'targetSegmentRule' => 'required|array',
            'couponId' => 'nullable|string',
            'scheduledAt' => 'required|date',
        ];
    }
}
