<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\StaffLoginHistory;
use App\Models\Attendance;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class StaffController extends Controller
{
    public function index()
    {
        return response()->json(Staff::all());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'phone' => 'required|string|unique:Staff,phone',
            'role' => 'required|string',
            'pin' => 'required|string',
        ]);

        $staff = Staff::create([
            'id' => (string)Str::uuid(),
            'name' => $data['name'],
            'phone' => $data['phone'],
            'role' => $data['role'],
            'pinHash' => Hash::make($data['pin']),
            'status' => 'ACTIVE',
        ]);

        return response()->json($staff, 201);
    }

    public function update(Request $request, $id)
    {
        $staff = Staff::find($id);
        if (!$staff) return response()->json(['message' => 'Staff not found'], 404);
        $staff->update($request->only(['name', 'phone', 'role', 'status']));
        return response()->json($staff);
    }

    public function destroy($id)
    {
        $staff = Staff::find($id);
        if (!$staff) return response()->json(['message' => 'Staff not found'], 404);
        $staff->status = 'INACTIVE';
        $staff->save();
        return response()->json(['message' => 'Staff deactivated']);
    }

    public function sessions()
    {
        return response()->json(StaffSession::with('staff')->where('isActive', true)->get());
    }

    public function revokeSessions()
    {
        StaffSession::query()->update(['isActive' => false]);
        return response()->json(['message' => 'All active sessions revoked']);
    }

    public function loginHistory()
    {
        return response()->json(StaffLoginHistory::with('staff')->orderBy('createdAt', 'desc')->get());
    }

    public function attendance()
    {
        return response()->json(Attendance::with('staff')->orderBy('clockIn', 'desc')->get());
    }

    public function clockIn(Request $request)
    {
        $staff = $request->attributes->get('auth_staff');
        $attendance = Attendance::create([
            'id' => (string)Str::uuid(),
            'staffId' => $staff->id,
            'clockIn' => now(),
        ]);
        return response()->json($attendance, 201);
    }

    public function clockOut(Request $request)
    {
        $staff = $request->attributes->get('auth_staff');
        $attendance = Attendance::where('staffId', $staff->id)->whereNull('clockOut')->orderBy('clockIn', 'desc')->first();
        if ($attendance) {
            $attendance->clockOut = now();
            $attendance->duration = (int)ceil((now()->timestamp - strtotime($attendance->clockIn)) / 60);
            $attendance->save();
        }
        return response()->json($attendance);
    }
}
