<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
| This backend now also serves the built React/Vite capture-app frontend
| (see ../frontend and build-frontend.sh at the project root, which build
| the SPA straight into public/). Every non-API GET request returns the
| SPA's index.html so React Router can handle client-side routing/deep
| links. /api/* requests never reach here — routes/api.php matches them
| first.
*/

Route::get('/{any}', function () {
    $indexFile = public_path('index.html');

    if (! file_exists($indexFile)) {
        return response(
            'Frontend build not found. Run build-frontend.sh (or `npm run build` '.
            'inside /frontend) to generate public/index.html first.',
            503
        );
    }

    return response(file_get_contents($indexFile), 200)
        ->header('Content-Type', 'text/html; charset=UTF-8');
})->where('any', '^(?!api).*$');
