<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Equivalent of authController.js -> ensureDefaultAccounts(), which the
 * Node app calls automatically on every server start. Laravel doesn't
 * have an equivalent "run on boot" hook by default, so AuthController
 * calls the same logic defensively on login (see ensureDefaultAccounts())
 * — this seeder just does it once up front too, for a clean first deploy.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
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

        $this->command->warn("Seeded default admin/staff accounts — password: {$password}");
    }
}
