<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class UploadController extends Controller
{
    public function store(Request $request)
    {
        $request->validate(['file' => 'required|image|mimes:jpeg,png,webp|max:2048']);
        $path = $request->file('file')->store('uploads', 'public');
        return response()->json(['url' => '/storage/' . $path]);
    }
}
