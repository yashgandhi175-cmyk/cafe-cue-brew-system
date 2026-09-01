<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
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

    public function toggleStatus(Request $request, string $id)
    {
        $banner = Banner::find($id);
        if (!$banner) {
            return response()->json(['message' => 'Banner not found', 'statusCode' => 404], 404);
        }
        $banner->isActive = $request->has('isActive') ? (bool)$request->input('isActive') : !$banner->isActive;
        $banner->save();
        return response()->json($banner);
    }
}
