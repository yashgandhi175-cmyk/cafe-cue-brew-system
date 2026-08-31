<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Support\JwtHelper;
use App\Models\StaffSession;
use App\Models\Staff;
use Symfony\Component\HttpFoundation\Response;

class JwtAuthenticate
{
    public function handle(Request $request, Closure $next): Response
    {
        $header = $request->header('Authorization');
        if (!$header || !str_starts_with($header, 'Bearer ')) {
            return response()->json(['message' => 'Unauthorized: Missing token', 'statusCode' => 401], 401);
        }

        $token = substr($header, 7);
        $secret = env('JWT_SECRET', 'dev-secret-key');
        $payload = JwtHelper::decodeToken($token, $secret);

        if (!$payload || !isset($payload['sub']) || !isset($payload['sid'])) {
            return response()->json(['message' => 'Unauthorized: Invalid token', 'statusCode' => 401], 401);
        }

        $tokenHash = hash('sha256', $token);
        $session = StaffSession::where('token', $tokenHash)->where('id', $payload['sid'])->first();

        if (!$session || !$session->isActive || (strtotime($session->expiredAt) < time())) {
            return response()->json(['message' => 'Unauthorized: Session expired or logged out', 'statusCode' => 401], 401);
        }

        $session->lastUsedAt = now();
        $session->save();

        $staff = Staff::find($payload['sub']);
        if (!$staff || $staff->status === 'INACTIVE') {
            return response()->json(['message' => 'Unauthorized: Staff account inactive', 'statusCode' => 401], 401);
        }

        $request->attributes->set('auth_staff', $staff);
        $request->attributes->set('auth_session_id', $session->id);

        return $next($request);
    }
}
