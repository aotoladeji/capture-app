<?php

// Root entry point: serves the built SPA/static files from backend/public
// and forwards everything else to Laravel.
$public = __DIR__.'/backend/public';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$file = realpath($public.$path);

if ($file && is_file($file) && str_starts_with($file, realpath($public).DIRECTORY_SEPARATOR) && !str_ends_with($file, '.php')) {
    $types = ['css' => 'text/css', 'js' => 'application/javascript', 'svg' => 'image/svg+xml',
        'html' => 'text/html', 'json' => 'application/json', 'jpeg' => 'image/jpeg', 'jpg' => 'image/jpeg', 'png' => 'image/png'];
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    header('Content-Type: '.($types[$ext] ?? 'application/octet-stream'));
    readfile($file);
    return;
}

if ($path === '/' && is_file($public.'/index.html')) {
    readfile($public.'/index.html');
    return;
}

$_SERVER['SCRIPT_FILENAME'] = $public.'/index.php';
$_SERVER['SCRIPT_NAME'] = '/index.php';
require $public.'/index.php';
