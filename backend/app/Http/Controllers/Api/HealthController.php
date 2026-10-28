<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Converted from the /health and /api/health handlers in server/app.js.
 */
class HealthController extends Controller
{
    public function health()
    {
        try {
            $result = DB::selectOne('SELECT DATABASE() AS database_name');

            return response()->json([
                'status' => 'healthy',
                'timestamp' => now()->toIso8601String(),
                'service' => 'ID Card Platform API',
                'database' => [
                    'connected' => true,
                    'name' => $result->database_name ?? null,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status' => 'degraded',
                'timestamp' => now()->toIso8601String(),
                'service' => 'ID Card Platform API',
                'database' => [
                    'connected' => false,
                    'error' => $e->getMessage(),
                ],
            ], 503);
        }
    }
}
