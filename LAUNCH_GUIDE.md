# ID Card Capture Platform — Launch Guide

This folder contains the **whole capture app**: the Laravel API backend
(`backend/`) and the React/Vite capture frontend (`frontend/`). The
frontend builds straight into `backend/public`, so in production it's all
served by one Apache vhost, on one URL, with no CORS to configure.

```
capture-app/
├── build-frontend.sh    builds frontend/ into backend/public/
├── backend/     Laravel app (API, capture, printing integration) — see backend/README.md
└── frontend/    React/Vite capture-app source
```

> **This app is a companion to the `id-card-unit` management app.** They
> share one MySQL database (this app's login flow reads the management
> app's `scheduled_students` table), and the management app calls this
> app's `/api/printing/*` and `/api/verify/fingerprint` endpoints
> directly. See `backend/README.md` §1 for the exact settings that must
> match between the two. You'll typically run **both merged apps side by
> side** on the same server, on two different ports/vhosts.

## 0. Requirements

- PHP 8.2+ with `pdo_mysql`, `mbstring`, `xml`, `curl`, `zip`, **`imagick`**
  (imagick is required here — it generates the printable ID card PNGs)
- Composer 2
- MySQL 8 / MariaDB 10.6+ — **the same database as the `id-card-unit` app**
- Node.js 20+ and npm (only needed to *build* the frontend)
- Apache 2.4 with `mod_rewrite`

## 1. Database

Use the **same database** as the `id-card-unit` management app
(e.g. `id_card_unit`) — don't create a separate one. This app's own
migrations only add its own tables and won't collide with the management
app's tables.

## 2. Backend setup

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
```

Edit `backend/.env`:

| Variable | What to set |
|---|---|
| `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | same MySQL database as the management app |
| `JWT_SECRET` | a long random string — independent of the management app's own secret |
| `VERIFY_API_KEY` | must match `VERIFY_API_KEY` in the management app's `backend/.env` |
| `APP_URL` | the URL you'll access this app at, e.g. `http://localhost:5001` |

Then:

```bash
php artisan migrate
php artisan db:seed
```

## 3. Frontend build

From this folder's root:

```bash
./build-frontend.sh
```

Re-run any time you change frontend code and want to redeploy.

## 4. Run it

**Quick local check:**

```bash
cd backend
php artisan serve --port=5001
```

Open **http://127.0.0.1:5001** — you should see the capture-app landing
page. `/api/...` is handled by Laravel directly; everything else serves
the built React app.

**Production (Apache):** same pattern as the management app —
`backend/deploy/apache-vhost.conf` has a starting vhost. This app needs
its **own port or subdomain**, separate from the management app (it's
whatever `CAPTURE_APP_URL` points to in that app's `.env`).

## 5. Log in

| Role | Password |
|---|---|
| `admin` | `oladeji` |
| `staff` | `oladeji` |

This is the same default the original app shipped with. Change it via the
in-app change-password screen (or `POST /api/admin/change-password`)
before this is reachable outside your own machine.

## 6. Troubleshooting

- **Card images/PNG approval fail:** check `php -m | grep imagick` — the
  card generator needs it. Without it, approvals still go through but
  skip generating the printable image (matches the original's fallback
  behavior).
- **Login says "user not found" for students with a valid code:** confirm
  the `scheduled_students` table exists and this app's `DB_DATABASE`
  really is the management app's database, not a separate one.
- **"Frontend build not found" at `/`:** run `./build-frontend.sh`.
- Everything else is documented in `backend/README.md`.
