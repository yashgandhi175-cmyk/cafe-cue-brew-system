<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $staff = $request->attributes->get('auth_staff');
        if (!$staff) {
            return response()->json(['message' => 'Unauthorized', 'statusCode' => 401], 401);
        }

        if (!in_array($staff->role, $roles)) {
            return response()->json(['message' => 'Forbidden: Insufficient role permissions', 'statusCode' => 403], 403);
        }

        return $next($request);
    }
}
