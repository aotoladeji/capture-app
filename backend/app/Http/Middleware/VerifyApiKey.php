<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Equivalent of middleware/auth.js -> verifyApiKey.
 * Guards the external verification endpoints (/api/verify/*).
 */
class VerifyApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = $request->header('x-api-key');
        $expected = config('services.verify_api_key');

        if (! $key || ! $expected || ! hash_equals((string) $expected, (string) $key)) {
            return response()->json(['success' => false, 'message' => 'Invalid or missing API key'], 401);
        }

        return $next($request);
    }
}
