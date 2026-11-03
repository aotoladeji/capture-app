# ID Card Capture Platform — Laravel Backend

> **Looking to run the whole app (frontend + backend together)?** See
> `../LAUNCH_GUIDE.md` at the project root — it has the full setup steps
> and default login. This file focuses on the backend internals.

This is a conversion of the capture-app's Node/Express backend
(`server/`) to **Laravel 11, served by Apache, backed by MySQL/MariaDB**
— matching the same stack as the `id-card-unit` management app backend
converted earlier.

The React/Vite frontend in `client/` is unchanged. Point its
`VITE_API_URL` at wherever this backend ends up running.

## 1. Important: this app shares a database with `id-card-unit`

This backend's student-login flow (`POST /api/authenticate`) validates a
student's login code against the **`scheduled_students`** table — which
is owned by the `id-card-unit` management app's schema, not this app.

**You must point `DB_DATABASE` at the same MySQL database as the
management app's `backend/.env`.** This app's own migrations only create
its own tables (`admins`, `excel_files`, `excel_data`, `id_card_users`,
`fingerprints`, `staff_notifications`) — none of them collide in name
with the management app's tables, so both apps' migrations can safely
run against the same database.

If `scheduled_students` doesn't exist yet (e.g. you haven't deployed/
migrated the management app), the login flow degrades gracefully rather
than erroring: it falls back to checking for a matching code inside the
uploaded Excel row's raw data instead of failing outright.

Two other cross-app settings that matter (set in **both** apps so they agree):

| Setting | Where | Purpose |
|---|---|---|
| `VERIFY_API_KEY` | this app's `.env` **and** management app's `.env` | management app calls this app's `/api/verify/fingerprint` with this key |
| `CAPTURE_APP_URL` | management app's `.env` only | tells the management app where *this* app lives |

`JWT_SECRET` does **not** need to match between the two apps — each has
its own independent login/token system.

## 2. What's included

- Full API surface: excel upload/activate/delete/template, student/staff
  `authenticate`, capture flow (create-user, passport/signature/
  fingerprint capture, generate-idcard), staff dashboard (pending/
  approve/reject/reset-candidate/approved-today), the printing
  integration routes the management app depends on (`queue`, `approved`,
  `mark-printed`, `mark-collected`, `output`, `output-svg`,
  `output-image`, `fingerprint`), `idcard/*` image serving, and
  `verify/fingerprint*` (API-key protected).
- **Every route path and HTTP verb matches the original exactly** — the
  existing `client/` frontend and the management app's `CaptureAppService`
  need no changes.
- ID card SVG generation is a byte-for-byte port of the original's SVG
  markup (same dimensions, text positions, barcode). PNG rasterization
  uses `ext-imagick` in place of the original's `sharp`.
- Excel parsing uses `phpoffice/phpspreadsheet` in place of the original's
  `xlsx` npm package, with the same 40+ column-header aliases.
- Migrations for every table in `database/schema.sql`, plus a seeder for
  the default admin/staff accounts.
- The actual `blank_card.jpg` template and `id_card_template.xlsx` are
  bundled in `storage/app/templates/`.
- `NODE_REFERENCE/` — the original Node controllers/routes/utils, kept in
  this package so you can diff against exact original behaviour.

## 3. Local setup

```bash
composer install
cp .env.example .env
php artisan key:generate
```

Edit `.env`:
- `DB_*` — **same database as the id-card-unit management app** (see §1)
- `JWT_SECRET` — any long random string (independent of the other app's)
- `VERIFY_API_KEY` — must match the management app's `VERIFY_API_KEY`
- `CORS_ORIGINS` / `CLIENT_URL` — this app's frontend origin(s)

Then:

```bash
php artisan migrate
php artisan db:seed
php artisan serve --port=5001
```

Visit `http://127.0.0.1:5001/api/health` — should return `{"status":"healthy",...}`.

## 4. Apache deployment

1. `composer install --no-dev --optimize-autoloader` on the server.
2. Use `deploy/apache-vhost.conf` as a starting point — this app needs
   its **own port or subdomain**, separate from the management app.
3. Enable `mod_rewrite`; make `storage/` and `bootstrap/cache/` writable
   by the Apache user.
4. `APP_ENV=production`, `APP_DEBUG=false` in `.env`.
5. `php artisan config:cache route:cache` after every deploy.
6. `php artisan migrate --force` for schema changes.
7. Confirm `php -m | grep imagick` — required for PNG card generation and
   approval; without it, card approval still marks records approved but
   skips generating the printable image (same fallback the original had).

## 5. Log in

The seeder creates:

| Role | Password |
|---|---|
| `admin` | `oladeji` |
| `staff` | `oladeji` |

This is the **exact same default password the original Node app
hard-coded** (`DEFAULT_ADMIN_PASSWORD = 'oladeji'` in `authController.js`)
— nothing to migrate here, but you should still change it via
`POST /api/admin/change-password` before this is reachable outside your
own machine. You can override the seeded password by setting
`DEFAULT_ADMIN_PASSWORD` in `.env` before running `db:seed`.

## 6. Verifying nothing broke

Since I couldn't run `composer install` in this environment (no access to
Packagist), every PHP file here has been checked with `php -l` (syntax)
and manually cross-referenced (every route → controller → method exists,
correctly grouped WHERE/OR clauses, no references to non-existent
columns). But this has **not been run against a live database** — before
trusting it in production, at minimum:

1. `php artisan migrate` against a real MySQL database and confirm no errors.
2. Log in as admin/staff.
3. Upload a real Excel sheet via `/api/excel/upload` and confirm the
   column mapping matches your actual spreadsheet headers.
4. Run through one full capture (login → photo → signature → fingerprint
   → generate-idcard → staff approve) and confirm the PNG/SVG endpoints
   render correctly.
5. From the management app, hit `CAPTURE_APP_URL/api/printing/approved`
   and `/api/health` directly to confirm the integration still works end
   to end.
