<?php

namespace App\Support;

class JwtHelper
{
    public static function generateToken(array $payload, string $secret): string
    {
        $header = json_encode(['alg' => 'HS256', 'typ' => 'JWT']);
        $base64UrlHeader = self::base64UrlEncode($header);
        $base64UrlPayload = self::base64UrlEncode(json_encode($payload));
        $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, $secret, true);
        $base64UrlSignature = self::base64UrlEncode($signature);
        return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
    }

    public static function decodeToken(string $jwt, string $secret): ?array
    {
        $tokenParts = explode('.', $jwt);
        if (count($tokenParts) !== 3) {
            return null;
        }
        [$base64UrlHeader, $base64UrlPayload, $base64UrlSignature] = $tokenParts;
        $signature = self::base64UrlEncode(hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, $secret, true));
        if (!hash_equals($signature, $base64UrlSignature)) {
            return null;
        }
        $payload = json_decode(self::base64UrlDecode($base64UrlPayload), true);
        return is_array($payload) ? $payload : null;
    }

    public static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function base64UrlDecode(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/'));
    }
}
