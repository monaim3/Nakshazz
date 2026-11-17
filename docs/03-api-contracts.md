# Nakshazz — Phase 3: Backend Architecture & API Contracts

Status: **implemented — 58 tests passing** (run `php artisan route:list --path=api` for the exact route list).
Note: endpoints that accept file uploads (banners, expenses, settings) use `POST` for updates, because browsers cannot send files with `PATCH`.
Base URL: `https://api.nakshazz.com/api/v1`

---

## 1. Build Order (Phase 3 sub-steps)

| Step | Content | Done when |
|---|---|---|
| 3a | Laravel scaffold, config, enums, migrations, models, seeders | `migrate --seed` runs clean |
| 3b | Services: Inventory, Pricing, Coupon, Order, Payment, Report + feature tests | stock/money tests green |
| 3c | Public API (catalog, checkout, tracking, reviews, pages, settings) | contract tests green |
| 3d | Admin API (auth, CRUD, orders, POS, inventory, expenses, reports) + policies | contract tests green |

---

## 2. Conventions

### Success
```json
{ "data": { ... } }
{ "data": [ ... ], "meta": { "current_page": 1, "last_page": 4, "per_page": 20, "total": 73 } }
```

### Errors
| Code | When | Body |
|---|---|---|
| 401 | not logged in | `{ "message": "Unauthenticated." }` |
| 403 | role not allowed | `{ "message": "This action is unauthorized." }` |
| 404 | not found | `{ "message": "Not found." }` |
| 409 | stock / state conflict | `{ "message": "...", "errors": { "items.0.quantity": ["Only 2 left."] } }` |
| 422 | validation | `{ "message": "...", "errors": { "field": ["..."] } }` |
| 429 | rate limit | `{ "message": "Too many attempts." }` |

- Money in JSON = string with 2 decimals (`"1250.00"`) → no float rounding in JS.
- Dates = ISO 8601 with `+06:00`.
- Lists: `?page`, `?per_page` (max 100), `?sort=field|-field`.

### Auth
Sanctum SPA cookie: `GET /sanctum/csrf-cookie` → `POST /api/v1/admin/login`. Admin routes behind `auth:sanctum` + `active` + policy.

---

## 3. Public API

| Method | Path | Notes | Rate limit |
|---|---|---|---|
| GET | `/settings` | public keys only, delivery zones, payment options | |
| GET | `/categories` | active tree | |
| GET | `/products` | `q, category, min_price, max_price, sort (newest\|price\|-price\|popular), featured, page` | |
| GET | `/products/{slug}` | with variants (no cost), images, approved reviews, related | |
| GET | `/home` | hero banners, promo banners, featured, new arrivals, best sellers, categories, featured reviews | |
| POST | `/cart/validate` | re-price cart lines, report stock problems | 60/min |
| POST | `/coupons/apply` | `{code, items, phone?}` → discount | 10/min |
| POST | `/checkout` | creates order | 5/hour per IP + per phone |
| POST | `/orders/track` | `{order_number, phone}` → status timeline | 10/min |
| POST | `/reviews` | pending moderation | 5/hour |
| GET | `/pages/{slug}` | policies, about | |
| GET | `/banners` | active by placement | |
| POST | `/contact` | contact message | 5/hour |

### POST /checkout
Request:
```json
{
  "customer": { "name": "Ayesha", "phone": "01712345678", "email": null },
  "shipping": { "address": "House 12, Road 5", "area": "Dhanmondi", "city": "Dhaka", "delivery_zone_id": 1 },
  "items": [ { "variant_id": 14, "quantity": 2 } ],
  "coupon_code": "EID10",
  "payment": { "method": "bkash", "sender_number": "01811111111", "transaction_id": "9JK3LM2X1Q" },
  "note": "Gift wrap please"
}
```
`payment.method` = `cod` | `bkash`. `sender_number` + `transaction_id` required if bkash.

Response 201:
```json
{ "data": {
  "order_number": "NK100245", "uuid": "…", "status": "pending",
  "payment_status": "pending_verification",
  "items_subtotal": "2400.00", "discount": "240.00", "delivery_charge": "70.00", "grand_total": "2230.00"
} }
```
Errors: 409 stock changed, 422 validation / coupon invalid / duplicate TrxID.

### POST /orders/track
`{ "order_number": "NK100245", "phone": "01712345678" }` → status, timeline (status + date only), items (name, variant, qty, price), totals, payment_status. Phone mismatch → 404 (do not reveal existence).

---

## 4. Admin API (`/admin/...`)

Role key: **O** = owner only, **S** = owner + staff.

| Resource | Endpoints | Role |
|---|---|---|
| Auth | `POST login`, `POST logout`, `GET me` | — |
| Dashboard | `GET dashboard?from&to` | S (profit cards O) |
| Categories | CRUD `categories` | S |
| Products | CRUD `products`, `POST products/{id}/archive` | S (cost fields O) |
| Variants | nested in product payload; `PATCH variants/{id}` | S (cost O) |
| Images | `POST products/{id}/images`, `PATCH images/{id}`, `DELETE images/{id}` | S |
| Inventory | `GET inventory?low_stock=1`, `GET inventory/{variant}/movements`, `POST inventory/adjust` | S |
| Orders | `GET orders?q&status&channel&source&from&to`, `GET orders/{id}`, `POST orders/{id}/status`, `POST orders/{id}/notes`, `PATCH orders/{id}/shipping`, `POST orders/{id}/returns` | S |
| Manual sales | `POST manual-sales` (→ OrderService), `GET orders/{id}/invoice` | S |
| Payments | `POST orders/{id}/payments`, `POST payments/{id}/verify`, `POST payments/{id}/reject`, `POST orders/{id}/refunds` | S (refund O) |
| Customers | `GET customers?q`, `GET customers/{id}` (orders + totals), `PATCH customers/{id}` | S |
| Expenses | CRUD `expenses`, CRUD `expense-categories` | O |
| Coupons | CRUD `coupons` | O |
| Reports | `GET reports/summary`, `reports/channels`, `reports/products`, `reports/monthly` (all `from,to`) | O |
| Reviews | `GET reviews`, `PATCH reviews/{id}`, `POST reviews` (import) | S |
| Banners | CRUD `banners` | S |
| Pages | `GET pages`, `PUT pages/{slug}` | S |
| Settings | `GET settings`, `PUT settings`, CRUD `delivery-zones` | O |
| Users | CRUD `users` | O |

### POST /admin/manual-sales
```json
{
  "channel": "facebook",
  "status": "delivered",                 // delivered (handed over) | confirmed (needs courier)
  "customer": { "name": "Rina", "phone": "01911111111" },   // optional
  "shipping": { "address": "...", "area": "...", "city": "...", "delivery_zone_id": 2 },  // required if confirmed
  "items": [ { "variant_id": 14, "quantity": 1, "unit_price": "1200.00" } ],  // unit_price optional override
  "manual_discount": "100.00",
  "coupon_code": null,
  "delivery_charge": "0.00",
  "payment": { "method": "cash", "amount": "1100.00", "transaction_id": null },
  "note": "Sold at fair stall"
}
```
→ 201 order resource + `invoice_url`.

### POST /admin/orders/{id}/status
`{ "status": "shipped", "note": "Steadfast", "courier_name": "Steadfast", "tracking_code": "SF123", "delivery_cost": "60.00" }`
Invalid transition → 409.

### POST /admin/orders/{id}/returns
`{ "items": [ { "order_item_id": 31, "quantity": 1, "damaged": 0 } ], "refund": { "amount": "1200.00", "method": "bkash" } }`
Full return → order `returned`; partial → stays `delivered`.

### POST /admin/inventory/adjust
`{ "variant_id": 14, "type": "purchase|adjustment_in|adjustment_out", "quantity": 10, "reason": "New batch" }`

### GET /admin/reports/summary?from=2026-11-01&to=2026-11-30
```json
{ "data": {
  "realized": { "orders": 41, "product_revenue": "…", "discounts": "…", "cogs": "…", "gross_profit": "…",
                "delivery_net": "…", "payment_fees": "…", "compensation": "…",
                "operating_expenses": "…", "net_profit": "…" },
  "estimated": { "orders": 9, "product_revenue": "…", "cogs": "…", "gross_profit": "…" }
} }
```

---

## 5. Service Responsibilities

| Service | Owns | Called by |
|---|---|---|
| `InventoryService` | reserve, release, sell, restock, adjust, return; row locks; movement log | OrderService, inventory controller |
| `PricingService` | line totals, discount allocation, delivery charge, grand total | OrderService, cart validate |
| `CouponService` | validate, compute, record/release usage | PricingService, OrderService |
| `OrderService` | create (website + manual), status transitions, returns | checkout + manual-sales controllers |
| `PaymentService` | record payment/refund, verify/reject, payment_status recalculation | OrderService, payment controllers |
| `ReportService` | summary, by channel/product/month (snapshots only) | dashboard + reports controllers |
| `PhoneNumber` (value helper) | normalize BD numbers | requests, services |

All writes inside `DB::transaction()`; variants locked `lockForUpdate()` in sorted id order (avoids deadlocks).

---

## 6. Edge Cases (Phase 3 tests)

1. Two checkouts for last unit → one 201, one 409.
2. Client sends fake price → ignored; server price used.
3. Coupon past limit between apply and checkout → 422.
4. Cancel after reserve → reserved back to 0, coupon released.
5. Ship → on_hand drops, reserved drops.
6. Refused parcel (shipped → returned) → stock back, delivery_cost counted.
7. Partial return with damaged unit → revenue down, cost loss kept.
8. Duplicate bKash TrxID → 422.
9. Made-to-order variant with 0 stock → order allowed.
10. Invalid transition (delivered → pending) → 409.
11. Product cost changed after sale → report unchanged.
12. Staff calling owner-only report → 403.
13. Track with wrong phone → 404.
