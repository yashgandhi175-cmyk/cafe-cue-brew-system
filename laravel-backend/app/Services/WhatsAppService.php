<?php

namespace App\Services;

class WhatsAppService
{
    public function normalizePhone(?string $phone): ?string
    {
        if (!$phone) return null;
        $digits = preg_replace('/[^0-9]/', '', $phone);
        if (!$digits) return null;

        if (strlen($digits) === 10) {
            return "91{$digits}";
        }
        if (strlen($digits) === 12 && str_starts_with($digits, '91')) {
            return $digits;
        }
        if (strlen($digits) >= 10) {
            return $digits;
        }
        return null;
    }

    public function generateWhatsAppLink(?string $phone, string $message): ?string
    {
        $normalized = $this->normalizePhone($phone);
        if (!$normalized) return null;
        return "https://wa.me/{$normalized}?text=" . urlencode($message);
    }

    public function send(string $to, mixed $payload): array
    {
        $recipient = $this->normalizePhone($to);
        if (!$recipient) {
            throw new \Exception('Recipient phone number is invalid.');
        }

        $message = $this->buildMessage($payload);
        $url = "https://wa.me/{$recipient}?text=" . urlencode($message);

        return [
            'messageSid' => 'wa-link-' . (int)(microtime(true) * 1000),
            'deliveredLocally' => false,
            'rawResponse' => [
                'type' => 'CLICK_TO_WHATSAPP',
                'url' => $url,
                'recipient' => $recipient,
                'message' => $message,
            ],
        ];
    }

    private function buildMessage(mixed $payload): string
    {
        if (!$payload) return '';
        if (is_string($payload)) return $payload;
        if (is_array($payload)) {
            if (!empty($payload['message']) && is_string($payload['message'])) return $payload['message'];
            if (!empty($payload['text']) && is_string($payload['text'])) return $payload['text'];
            if (!empty($payload['body']) && is_string($payload['body'])) return $payload['body'];
            if (!empty($payload['template'])) {
                $tpl = $payload['template'];
                if (is_array($tpl)) {
                    if (!empty($tpl['body']) && is_string($tpl['body'])) return $tpl['body'];
                    if (!empty($tpl['text']) && is_string($tpl['text'])) return $tpl['text'];
                }
            }
        }
        return '';
    }
}
