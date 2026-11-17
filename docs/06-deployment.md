# 06 — Deployment (cPanel, NikolaHost)

First deployed 2026-11-18. Shell access (SSH and cPanel Terminal) is **disabled** on this
account, so everything is built on the developer PC and uploaded; server-side commands run
through a **temporary cron job** that is removed afterwards.

## Layout on the server (`/home4/nakshazz`)

| Path | What |
|---|---|
| `nakshazz-api/` | Laravel API. Docroot of `api.nakshazz.com` is `nakshazz-api/public`. `.env` lives here (not in git). |
| `nakshazz-web/` | Next.js shop. cPanel **Setup Node.js App**: Node 20.20.2, mode Production, URL `nakshazz.com/`, startup file `app.js`. |
| `nakshazz-web/app/` | Next.js `standalone` bundle (`server.js`, `node_modules`, `.next`, `public`). Kept out of the app root because the Node selector manages the root's `node_modules`. |
| `nakshazz-web/.env.runtime` | Runtime secrets read by `app.js` (`REVALIDATE_SECRET`). |
| `coming-soon-backup/` | The old coming-soon page from `public_html` (restore by copying it back). |

- Database: `nakshazz_shop`, user `nakshazz_app` (MariaDB 10.11). Password only in `nakshazz-api/.env`.
- PHP: CloudLinux **Select PHP Version** → account-wide **8.4** with `fileinfo`, `intl`, `opcache`, `sodium` enabled. (`ea-php84` from MultiPHP lacks `fileinfo`, so `api.nakshazz.com` is set to *inherit* in MultiPHP.) Per-domain PHP is locked by the host.
- `api.nakshazz.com/public/.htaccess` must keep Laravel's rewrite rules; re-apply the PHP version in MultiPHP/selector after replacing it.
- First data: catalog, settings, categories and reviews from the local DB; test orders/customers/expenses removed.

## Redeploy the shop (frontend)

1. `frontend/.env.production.local` (git-ignored) holds `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL=https://api.nakshazz.com/api/v1`, `NEXT_PUBLIC_BACKEND_URL`, `REVALIDATE_SECRET`.
2. `npx next build` (prerendering calls the live API, so it must be up).
3. Package `nakshazz-web/app/` = `.next/standalone/*` + `.next/static` → `app/.next/static` + `public` → `app/public`; keep `app.js` and `.env.runtime`.
4. Upload the zip (cPanel File Manager), unzip over `nakshazz-web/` with a one-off cron job, then **Restart** the app in Setup Node.js App.

`next.config.mjs` uses `output: "standalone"` and `images.unoptimized` (built on Windows; `sharp` would be the wrong platform on Linux).

## Redeploy the API (backend)

1. Copy `backend/` from git, `composer install --no-dev --optimize-autoloader` locally (no Composer on the server).
2. Zip without `.env`, upload, unzip over `nakshazz-api/` via one-off cron, then in the same cron:
   `php artisan migrate --force && php artisan config:cache && php artisan route:cache && php artisan event:cache`
   (CLI PHP: `/opt/cpanel/ea-php84/root/usr/bin/php`).
3. Check `https://api.nakshazz.com/api/v1/home` returns 200.

## Recommended

- Ask NikolaHost support to **enable SSH (jailed shell)** — then deploys become `git pull` + commands, no cron workaround.
- Add a cron for the scheduler when it is needed: `* * * * * cd ~/nakshazz-api && php artisan schedule:run`.
- Set real mail (SMTP) in `nakshazz-api/.env` for order notification emails (currently `MAIL_MAILER=log`).
