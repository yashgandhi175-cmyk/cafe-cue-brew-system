<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\AuthService;

class AuthController extends Controller
{
    protected $authService;

    public function __construct(AuthService $authService)
    {
        $this->authService = $authService;
    }

    public function login(Request $request)
    {
        $request->validate([
            'staffId' => 'required|string',
            'pin' => 'required|string',
        ]);

        try {
            $result = $this->authService->login($request->all(), $request->ip(), $request->userAgent());
            return response()->json($result);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function logout(Request $request)
    {
        $staff = $request->attributes->get('auth_staff');
        $header = $request->header('Authorization');
        $token = $header && str_starts_with($header, 'Bearer ') ? substr($header, 7) : '';

        if ($staff) {
            $this->authService->logout($token, $staff->id, $request->ip());
        }

        return response()->json(['message' => 'Logged out successfully']);
    }

    public function me(Request $request)
    {
        $staff = $request->attributes->get('auth_staff');
        return response()->json([
            'id' => $staff->id,
            'name' => $staff->name,
            'phone' => $staff->phone,
            'role' => $staff->role,
            'mustChangePin' => (bool)$staff->mustChangePin,
        ]);
    }

    public function changePin(Request $request)
    {
        $request->validate([
            'currentPin' => 'required|string',
            'newPin' => 'required|string',
        ]);

        $staff = $request->attributes->get('auth_staff');

        try {
            $result = $this->authService->changePin(
                $staff,
                $request->input('currentPin'),
                $request->input('newPin'),
                $request->ip()
            );
            return response()->json($result);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }
}
