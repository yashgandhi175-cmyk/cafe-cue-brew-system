<?php

namespace App\Http\Controllers;

use App\Models\Banner;

class BannerController extends Controller
{
    public function index()
    {
        return response()->json(Banner::where('isActive', true)->get());
    }

    public function publicBanners()
    {
        return response()->json(Banner::where('isActive', true)->get());
    }
}
