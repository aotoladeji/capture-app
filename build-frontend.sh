#!/usr/bin/env bash
# Builds the React/Vite frontend straight into ./public, so the Laravel app
# serves both the SPA and the API from one folder. Run after any frontend change.
set -e

cd "$(dirname "$0")/frontend"

echo "Installing frontend dependencies..."
npm install

echo "Building frontend into ../public ..."
npm run build

echo "Done. public/ now contains index.html + assets/ alongside index.php."