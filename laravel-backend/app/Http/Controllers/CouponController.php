<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Coupon;

class CouponController extends Controller
{
    public function index()
    {
        return response()->json(Coupon::where('isActive', true)->get());
    }

    public function toggleStatus(Request $request, string $id)
    {
        $coupon = Coupon::find($id);
        if (!$coupon) {
            return response()->json(['message' => 'Coupon not found', 'statusCode' => 404], 404);
        }
        $coupon->isActive = $request->has('isActive') ? (bool)$request->input('isActive') : !$coupon->isActive;
        $coupon->save();
        return response()->json($coupon);
    }
}
