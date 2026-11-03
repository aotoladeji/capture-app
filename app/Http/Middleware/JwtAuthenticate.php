<?php

namespace App\Http\Middleware;

use Closure;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Equivalent of the various JWT checks scattered across the Node app
 * (middleware/auth.js verifyAdmin/authMiddleware.verifyToken, and
 * middleware/authMiddleware.js verifyAdmin). All of them do the same
 * thing: decode the bearer token with JWT_SECRET and attach the payload.
 *
 * Pass roles to also enforce the admin.js verifyAdmin role check, e.g.
 * ->middleware('auth.jwt:admin,staff'). With no roles, it behaves like
 * authMiddleware.js verifyAdmin / verifyToken (any valid token passes).
 */
class JwtAuthenticate
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $header = $request->header('Authorization', '');
        $token = null;

        if ($header && str_contains($header, ' ')) {
            $token = explode(' ', $header, 2)[1];
        }

        if (! $token) {
            return response()->json(['success' => false, 'message' => 'No token provided'], 401);
        }

        try {
            $decoded = (array) JWT::decode($token, new Key(config('app.jwt_secret'), 'HS256'));
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => 'Invalid or expired token'], 401);
        }

        if (! empty($roles) && ! in_array($decoded['role'] ?? null, $roles, true)) {
            return response()->json(['success' => false, 'message' => 'Access denied'], 403);
        }

        $request->attributes->set('authUser', $decoded);

        return $next($request);
    }
}
