# Nakshazz

Handmade jewellery e-commerce and business management system (Bangladesh).

- `frontend/` — Next.js storefront (English + Bangla) and admin dashboard
- `backend/` — Laravel REST API (Sanctum, MariaDB)
- `docs/` — architecture, database schema, API contracts, storefront design

## Local setup

```bash
# backend
cd backend
cp .env.example .env        # fill in DB credentials
composer install
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
php artisan serve

# frontend
cd frontend
cp .env.example .env.local
npm install
npm run dev
```
