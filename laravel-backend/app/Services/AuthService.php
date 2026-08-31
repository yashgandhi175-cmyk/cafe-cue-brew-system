<?php

namespace App\Services;

use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\StaffLoginHistory;
use App\Models\RestaurantSettings;
use App\Models\AuditLog;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthService
{
    public function login(array $data, ?string $ipAddress = null, ?string $userAgent = null): array
    {
        $staff = Staff::find($data['staffId'] ?? '');
        if (!$staff) {
            throw new \Exception('Staff profile not found', 401);
        }

        if ($staff->status === 'INACTIVE') {
            throw new \Exception('Staff account is deactivated', 403);
        }

        $settings = RestaurantSettings::find('default');
        $maxAttempts = $settings ? $settings->maxFailedAttempts : 5;
        $lockMinutes = $settings ? $settings->accountLockDuration : 15;
        $pinLength = $settings ? $settings->pinLength : 4;

        $pin = $data['pin'] ?? '';
        if (strlen($pin) !== $pinLength) {
            throw new \Exception("PIN must be exactly {$pinLength} digits according to policy.", 400);
        }

        if ($staff->lockedUntil && strtotime($staff->lockedUntil) > time()) {
            $remaining = ceil((strtotime($staff->lockedUntil) - time()) / 60);
            StaffLoginHistory::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staff->id,
                'status' => 'FAILED',
                'failureReason' => 'Account is locked',
                'ipAddress' => $ipAddress,
                'createdAt' => now(),
            ]);
            throw new \Exception("Account is temporarily locked. Try again in {$remaining} minute(s).", 403);
        }

        if (!Hash::check($pin, $staff->pinHash)) {
            $staff->failedAttempts += 1;
            if ($staff->failedAttempts >= $maxAttempts) {
                $staff->lockedUntil = now()->addMinutes($lockMinutes);
                $staff->save();

                StaffLoginHistory::create([
                    'id' => (string)Str::uuid(),
                    'staffId' => $staff->id,
                    'status' => 'FAILED',
                    'failureReason' => 'Incorrect PIN',
                    'ipAddress' => $ipAddress,
                    'createdAt' => now(),
                ]);

                throw new \Exception("Incorrect PIN. Too many failed attempts. Account locked for {$lockMinutes} minutes.", 401);
            }

            $staff->save();

            StaffLoginHistory::create([
                'id' => (string)Str::uuid(),
                'staffId' => $staff->id,
                'status' => 'FAILED',
                'failureReason' => 'Incorrect PIN',
                'ipAddress' => $ipAddress,
                'createdAt' => now(),
            ]);

            $remaining = $maxAttempts - $staff->failedAttempts;
            throw new \Exception("Incorrect PIN. {$remaining} attempt(s) remaining.", 401);
        }

        $staff->failedAttempts = 0;
        $staff->lockedUntil = null;
        $staff->lastLogin = now();
        $staff->save();

        $sessionId = (string)Str::uuid();
        $secret = env('JWT_SECRET', 'dev-secret-key');
        $payload = [
            'sub' => $staff->id,
            'role' => $staff->role,
            'name' => $staff->name,
            'sid' => $sessionId,
        ];

        $token = JwtHelper::generateToken($payload, $secret);
        $tokenHash = hash('sha256', $token);
        $timeout = $settings ? $settings->sessionTimeout : 720;

        StaffSession::create([
            'id' => $sessionId,
            'staffId' => $staff->id,
            'token' => $tokenHash,
            'expiredAt' => now()->addMinutes($timeout),
            'userAgent' => $userAgent,
            'ipAddress' => $ipAddress,
            'isActive' => true,
            'lastUsedAt' => now(),
            'createdAt' => now(),
        ]);

        StaffLoginHistory::create([
            'id' => (string)Str::uuid(),
            'staffId' => $staff->id,
            'status' => 'SUCCESS',
            'failureReason' => null,
            'ipAddress' => $ipAddress,
            'createdAt' => now(),
        ]);

        AuditLog::create([
            'id' => (string)Str::uuid(),
            'staffId' => $staff->id,
            'action' => 'LOGIN',
            'ipAddress' => $ipAddress,
            'createdAt' => now(),
        ]);

        return [
            'token' => $token,
            'staff' => [
                'id' => $staff->id,
                'name' => $staff->name,
                'phone' => $staff->phone,
                'role' => $staff->role,
                'mustChangePin' => (bool)$staff->mustChangePin,
            ],
        ];
    }

    public function logout(string $token, string $staffId, ?string $ipAddress = null): void
    {
        $tokenHash = hash('sha256', $token);
        StaffSession::where('token', $tokenHash)->orWhere('id', $token)->delete();

        AuditLog::create([
            'id' => (string)Str::uuid(),
            'staffId' => $staffId,
            'action' => 'LOGOUT',
            'ipAddress' => $ipAddress,
            'createdAt' => now(),
        ]);
    }

    public function changePin(Staff $staff, string $currentPin, string $newPin, ?string $ipAddress = null): array
    {
        $settings = RestaurantSettings::find('default');
        $pinLength = $settings ? $settings->pinLength : 4;

        if (strlen($newPin) !== $pinLength) {
            throw new \Exception("PIN must be exactly {$pinLength} digits according to policy.", 400);
        }

        if (!Hash::check($currentPin, $staff->pinHash)) {
            throw new \Exception('Incorrect current PIN', 401);
        }

        $staff->pinHash = Hash::make($newPin);
        $staff->mustChangePin = false;
        $staff->save();

        AuditLog::create([
            'id' => (string)Str::uuid(),
            'staffId' => $staff->id,
            'action' => 'CHANGE_PIN',
            'ipAddress' => $ipAddress,
            'createdAt' => now(),
        ]);

        return ['message' => 'PIN updated successfully'];
    }
}
