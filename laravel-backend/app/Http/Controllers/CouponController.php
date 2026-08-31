<?php

namespace App\Http\Controllers;

use App\Models\Coupon;

class CouponController extends Controller
{
    public function index()
    {
        return response()->json(Coupon::where('isActive', true)->get());
    }
}
