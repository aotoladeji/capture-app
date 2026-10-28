<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Forces JSON Accept headers and applies the same CORS allow-list logic
 * that lived in server/app.js (allowedOrigins array).
 */
class ForceJsonResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->headers->set('Accept', 'application/json');

        if ($request->getMethod() === 'OPTIONS') {
            $response = response('', 204);
        } else {
            $response = $next($request);
        }

        $origin = $request->headers->get('Origin');

        if ($origin && $this->isAllowedOrigin($origin)) {
            $response->headers->set('Access-Control-Allow-Origin', $origin);
            $response->headers->set('Vary', 'Origin');
            $response->headers->set('Access-Control-Allow-Credentials', 'true');
            $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
        }

        return $response;
    }

    private function isAllowedOrigin(string $origin): bool
    {
        $normalized = $this->normalize($origin);

        $defaults = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:4000', 'http://localhost:5173', 'https://id-card-unit.vercel.app'];

        $configured = array_filter(array_map(
            fn ($o) => $this->normalize(trim($o)),
            explode(',', (string) env('CORS_ORIGINS', ''))
        ));

        $clientUrl = $this->normalize((string) env('CLIENT_URL', ''));

        $allowed = array_unique(array_filter(array_merge(
            array_map([$this, 'normalize'], $defaults),
            $configured,
            [$clientUrl]
        )));

        return in_array($normalized, $allowed, true);
    }

    private function normalize(string $value): string
    {
        return strtolower(rtrim(trim($value), '/'));
    }
}
