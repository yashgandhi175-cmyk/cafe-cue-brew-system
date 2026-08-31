<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\RestaurantSettings;

class SettingsController extends Controller
{
    public function show()
    {
        $settings = RestaurantSettings::find('default');
        if (!$settings) {
            $settings = RestaurantSettings::create(['id' => 'default', 'name' => 'Cafe Cue & Brew']);
        }
        return response()->json($settings);
    }

    public function update(Request $request)
    {
        $settings = RestaurantSettings::find('default');
        if (!$settings) {
            $settings = RestaurantSettings::create(['id' => 'default']);
        }
        $settings->update($request->all());
        return response()->json($settings);
    }
}
