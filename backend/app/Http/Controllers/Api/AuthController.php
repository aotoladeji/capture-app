<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Firebase\JWT\JWT;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    /**
     * Equivalent of ensureDefaultAccounts() — self-heals the admin/staff
     * accounts if they're missing (e.g. fresh DB). Called defensively on
     * every login attempt, exactly like the original.
     */
    private function ensureDefaultAccounts(): void
    {
        $password = config('services.default_admin_password');

        foreach (['admin', 'staff'] as $role) {
            if (! DB::table('admins')->where('role', $role)->exists()) {
                DB::table('admins')->insert([
                    'role' => $role,
                    'password_hash' => Hash::make($password),
                    'created_at' => now(),
                ]);
            }
        }
    }

    // POST /api/admin/login
    public function login(Request $request)
    {
        $password = $request->input('password');
        $role = $request->input('role');

        if (! $password || ! $role) {
            return response()->json(['success' => false, 'message' => 'Password and role are required'], 400);
        }

        $admin = DB::table('admins')->where('role', $role)->first();

        if (! $admin) {
            $this->ensureDefaultAccounts();
            $admin = DB::table('admins')->where('role', $role)->first();

            if (! $admin) {
                return response()->json(['success' => false, 'message' => 'Invalid credentials'], 401);
            }
        }

        if (! Hash::check($password, $admin->password_hash)) {
            return response()->json(['success' => false, 'message' => 'Invalid credentials'], 401);
        }

        if (! config('app.jwt_secret')) {
            return response()->json(['success' => false, 'message' => 'Server configuration error'], 500);
        }

        $token = JWT::encode([
            'id' => $admin->id,
            'role' => $admin->role,
            'iat' => time(),
            'exp' => time() + (30 * 24 * 60 * 60), // 30d, matches the original
        ], config('app.jwt_secret'), 'HS256');

        return response()->json([
            'success' => true,
            'message' => 'Login successful',
            'token' => $token,
            'role' => $admin->role,
        ]);
    }

    // POST /api/admin/change-password  (requires auth.jwt middleware)
    public function changePassword(Request $request)
    {
        $oldPassword = $request->input('oldPassword');
        $newPassword = $request->input('newPassword');
        $adminId = $request->attributes->get('authUser')['id'] ?? null;

        if (! $oldPassword || ! $newPassword) {
            return response()->json(['success' => false, 'message' => 'Both old and new passwords are required'], 400);
        }

        $admin = DB::table('admins')->where('id', $adminId)->first();

        if (! $admin) {
            return response()->json(['success' => false, 'message' => 'User not found'], 404);
        }

        if (! Hash::check($oldPassword, $admin->password_hash)) {
            return response()->json(['success' => false, 'message' => 'Old password is incorrect'], 401);
        }

        DB::table('admins')->where('id', $adminId)->update([
            'password_hash' => Hash::make($newPassword),
        ]);

        return response()->json(['success' => true, 'message' => 'Password changed successfully']);
    }
}
