<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCampaignRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name' => 'sometimes|string|max:255',
            'type' => 'sometimes|string|in:WHATSAPP,EMAIL,SMS,PUSH',
            'templateId' => 'sometimes|string',
            'templateVariables' => 'nullable|array',
            'targetSegmentRule' => 'sometimes|array',
            'couponId' => 'nullable|string',
            'scheduledAt' => 'sometimes|date',
        ];
    }
}
