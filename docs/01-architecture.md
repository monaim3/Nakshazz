# Nakshazz — Phase 1: Requirements Confirmation & Architecture

Status: **DRAFT — awaiting owner confirmation** (see §9 Open Questions)
Date: 2026-11-16

---

## 1. Scope Summary (confirmed from brief)

| Area | MVP | Later |
|---|---|---|
| Storefront (12 pages, search, filter, gallery, zoom, cart, coupon, guest checkout) | ✅ | Wishlist |
| Cash on Delivery | ✅ | bKash / SSLCommerz via pluggable gateway |
| Admin: products, variants, categories, images, costs | ✅ | |
| Inventory with movement ledger, reserved stock, low-stock alerts | ✅ | |
| Website order management + status history + internal notes | ✅ | Courier API (Steadfast / Pathao) |
| Manual sales / POS + printable receipt | ✅ | |
| Expenses, coupons, customers, banners, settings | ✅ | |
| Sales & Profit dashboard (estimated vs realized) | ✅ | |
| Customer accounts / login | ❌ (guest + order tracking) | Optional |
| Staff roles | Owner + Staff role column | Fine-grained permissions |

---

## 2. Recommended Changes (simplifications, not additions)

These keep the system smaller **and** more accurate.

### R1. One `orders` table for website AND manual sales  ⭐ most important
Brief suggests separate `sales` / `sale_items`. Recommend instead a single `orders` + `order_items` with:
- `source`: `website` | `manual`
- `channel`: `website` | `facebook` | `whatsapp` | `physical_store` | `other`

Why: one checkout service, one inventory path, one profit query. Reports never need `UNION`. Requirement "do not duplicate logic" satisfied by design, not by discipline.
Manual sale = order created by admin that jumps straight to `delivered` (or `confirmed` if it still needs shipping, e.g. Facebook order to be couriered).

### R2. Every product has at least one variant
Product without options gets one hidden "Default" variant. Stock, SKU, price, cost always live on the **variant**. Removes every `if (hasVariants)` branch in cart, checkout, POS, inventory, reports.

### R3. Stock columns on `product_variants` + `inventory_movements` ledger
Brief suggests separate `inventory` table — it would be 1:1 with variants, so merge it:
`stock_on_hand`, `stock_reserved` on variant; `available = on_hand − reserved`.
`inventory_movements` stays as the immutable audit log. Every stock change goes through `InventoryService` only.

### R4. Cart lives in the browser, server re-prices at checkout
Redux + localStorage cart. No `carts` table. On checkout, server ignores client prices, reloads variants, recalculates everything inside a DB transaction. Simpler and tamper-proof.

### R5. Refunds as rows in `payments` (type = `refund`)
No separate refunds module. `payments.type`: `payment` | `refund`, plus `gateway_fee`. Net revenue = payments − refunds.

### R6. Delivery money kept on the order, never in expenses
- `orders.delivery_charge` = what customer pays (pass-through income)
- `orders.delivery_cost` = what courier actually charged for this order
- Report shows **Delivery net** = charge − cost as its own line, outside product revenue/gross profit.
- Expense category "Delivery" is only for non-order costs (e.g. courier monthly fee). Category has a hint in UI to prevent double-entry.

### R7. Customer identity = normalized BD phone number
Guest checkout auto-creates/links `customers` row by phone (`01XXXXXXXXX`). Gives order history + total purchases without accounts. Order tracking = order number + phone.

### R8. Simple roles, no permission package
`users.role`: `owner` | `staff`. Laravel Policies check role. Staff cannot see cost/profit/expenses. Upgrade to spatie/permission only if needed later.

### R9. Admin lives inside the same Next.js app (`/admin`)
One frontend deployable instead of two. Route group with its own layout, no SSR/SEO, client-rendered.

### R10. Editable policy pages via `pages` table
Privacy / Return / Delivery / About stored as markdown, editable in admin. Owner never needs a developer to change a policy.

### Small recommended additions (cheap, high value for BD COD business)
- **Confirmation step for COD**: new website orders arrive `pending`; staff calls customer → `confirmed`. Already in status flow; dashboard highlights unconfirmed > 24h. Fights fake COD orders.
- **Rate limit checkout** per IP + per phone (e.g. 5 orders/hour).
- **Admin email notification** on new website order (Laravel mail, queued). SMS later.
- **On-demand revalidation**: Laravel pings Next.js when a product/banner changes → storefront updates in seconds while staying static-fast.

Not adding: multi-warehouse, multi-currency, accounting ledger, loyalty points, customer login, live chat.

---

## 3. System Architecture

```
                 ┌──────────────────────────────────────────┐
  Browser ──────▶│  Next.js (App Router, JS, Tailwind)      │
                 │   /            storefront (SSG/ISR, SEO) │
                 │   /admin/*     dashboard (client, auth)  │
                 └───────────────┬──────────────────────────┘
                                 │ HTTPS JSON  /api/v1/*
                                 ▼
                 ┌──────────────────────────────────────────┐
                 │  Laravel API (Sanctum)                   │
                 │   Controllers → FormRequests → Policies  │
                 │   Services (business logic)              │
                 │   Eloquent Models                        │
                 └───────────────┬──────────────────────────┘
                                 ▼
                       MariaDB      storage/ (images)
```

Domains (recommended):
- `nakshazz.com` → Next.js (storefront + `/admin`)
- `api.nakshazz.com` → Laravel
- Images served from `api.nakshazz.com/storage/...` (or CDN later)

Same root domain lets Sanctum use **httpOnly cookie session auth + CSRF** for admin — safer than tokens in localStorage.

### 3.1 Laravel structure

```
app/
  Http/Controllers/Api/V1/{Public,Admin}/...
  Http/Requests/...            validation
  Http/Resources/...           JSON shaping (hides cost fields from public)
  Policies/...
  Services/
    OrderService.php           create order (website + manual), status transitions
    InventoryService.php       reserve / release / deduct / restock / adjust
    PricingService.php         subtotal, coupon, delivery, totals
    CouponService.php
    ReportService.php          revenue, COGS, profit, by channel/product/month
    Payments/
      PaymentGateway.php       interface
      CashOnDeliveryGateway.php
  Enums/ OrderStatus, Channel, PaymentMethod, MovementType ...
```

Only services touch stock or money. Controllers stay thin.

### 3.2 Next.js structure

```
app/
  (store)/  page.js, shop/, category/[slug]/, product/[slug]/,
            cart/, checkout/, track-order/, about/, contact/, policies/[slug]/
  admin/    login/, dashboard/, products/, inventory/, orders/, pos/,
            customers/, expenses/, coupons/, reports/, content/, settings/
components/ ui/ (Button, Input, Modal, Table...), store/, admin/
lib/        api client, formatters (BDT), zod schemas
store/      Redux Toolkit: cartSlice, posSlice
```

Rendering:
| Page | Strategy |
|---|---|
| Home, category, product, policies | SSG + ISR (revalidate on demand) |
| Shop with filters/search | SSR (query params) |
| Cart, checkout, track | Client |
| Admin | Client, behind auth middleware |

---

## 4. Core Business Flows

### 4.1 Order lifecycle & stock

| Event | Stock effect | Movement type |
|---|---|---|
| Website order placed (`pending`) | reserved += qty | `reserve` |
| → `confirmed` / `processing` | none | — |
| → `shipped` | on_hand −= qty, reserved −= qty | `sale` |
| → `cancelled` before ship | reserved −= qty | `release` |
| → `delivered` | none (profit becomes **realized**) | — |
| → `returned` | on_hand += qty (or `damaged` writes off) | `return` |
| Manual sale (delivered immediately) | on_hand −= qty | `sale` |
| Manual sale needing shipment | same as website path from `confirmed` | |
| Admin adjustment | ± qty with reason | `adjustment` |
| Restock / production | on_hand += qty | `purchase` |

Allowed transitions enforced in `OrderService` (e.g. cannot go `delivered → pending`).

Negative stock: rejected unless `variant.allow_backorder` (made-to-order). Made-to-order shows preparation time on product page.

Concurrency: stock rows locked with `SELECT … FOR UPDATE` inside the order transaction → two customers cannot buy the last item.

### 4.2 Money per order (all DECIMAL(12,2))

```
items_subtotal      = Σ (unit_price × qty)
discount_total      = coupon + manual discount
product_revenue     = items_subtotal − discount_total      ← basis for gross profit
delivery_charge     (separate, not product revenue)
grand_total         = product_revenue + delivery_charge
cogs                = Σ (unit_cost_snapshot × qty)
gross_profit        = product_revenue − cogs − refunds_on_products
```

Report level:
```
Net profit = Σ gross_profit
           + Σ (delivery_charge − delivery_cost)
           − Σ gateway_fees
           − operating expenses (date range)
```

**Estimated** = orders in pending/confirmed/processing/shipped.
**Realized** = delivered (and manual completed) minus returned.
Cancelled excluded entirely.

### 4.3 Snapshots (historical accuracy)
`order_items` stores: product_name, variant_title, sku, unit_price, unit_cost, cost_breakdown (JSON). Reports read **only** snapshots. Changing product price/cost never touches past orders.

### 4.4 Product cost
Variant has `raw_material_cost`, `labour_cost`, `packaging_cost`, `other_cost` → `total_cost` computed on save. Product form fills defaults for all variants; override per variant.
Packaging inside product cost ⇒ expense category "Packaging" is for bulk/non-attributable packaging only (UI hint).

---

## 5. Database Entities (detail in Phase 2)

`users`, `customers`, `customer_addresses`, `categories`, `products`, `product_images`, `product_variants`, `inventory_movements`, `orders`, `order_items`, `order_status_histories`, `order_notes`, `payments`, `expenses`, `expense_categories`, `coupons`, `coupon_usages`, `reviews`, `banners`, `pages`, `store_settings` (key/value), `delivery_zones` (Inside Dhaka / Outside Dhaka charges).

Removed vs brief: `sales`, `sale_items` (→ orders, R1), `inventory` (→ variant columns, R3).

---

## 6. API Overview (`/api/v1`)

Response envelope:
```json
{ "data": {...}, "meta": {...} }            // success
{ "message": "...", "errors": { "field": ["..."] } }  // 422
```
Pagination: `?page=&per_page=` → `meta.current_page, last_page, total`.
Codes: 200, 201, 204, 401, 403, 404, 409 (stock conflict), 422, 429.

Public: `GET categories`, `GET products` (search/filter/sort), `GET products/{slug}`, `POST cart/validate`, `POST coupons/apply`, `POST checkout`, `POST orders/track`, `GET/POST reviews`, `GET banners`, `GET pages/{slug}`, `GET settings/public`.

Admin (`/admin/...`, Sanctum + policy): `auth`, `dashboard`, `products`, `variants`, `product-images`, `categories`, `inventory` (movements, adjust), `orders` (+status, notes), `manual-sales` (→ OrderService), `customers`, `payments`, `expenses`, `expense-categories`, `coupons`, `reports/*`, `banners`, `pages`, `settings`.

Full contracts written per phase before implementation.

---

## 7. Security

- Sanctum SPA cookie auth, CSRF, `SameSite=Lax`, login throttle (5/min).
- FormRequest validation on every write; Policies on every admin model.
- Public API Resources never include cost, profit, customer phone/address.
- Eloquent / query builder only (bound params). No raw string SQL.
- React escapes output; markdown pages rendered with sanitizer (no raw HTML).
- Image upload: mime + extension + size (≤5 MB) + re-encode to WebP (strips payload).
- Rate limits: checkout, tracking, coupon, review, login.
- No card data stored ever; gateways use hosted pages.
- Secrets only in `.env`; `.env.example` committed without values.

---

## 8. Hosting — must inspect before Phase 8 decisions

Checklist to run on existing hosting (via SSH or cPanel):

```
php -v                      # need ≥ 8.2 for Laravel 11/12
composer -V
mysql -V                    # MariaDB ≥ 10.6 preferred
node -v                     # need ≥ 18.18 / 20 for Next.js
which pm2 / cPanel "Setup Node.js App" present?
crontab -l                  # needed for Laravel scheduler/queue
df -h                       # storage
```

Decision tree:
| Hosting finding | Plan |
|---|---|
| VPS / SSH + Node ≥ 20 | Laravel (nginx/apache) + Next.js `standalone` under PM2 behind reverse proxy. Everything on existing host. |
| cPanel with "Setup Node.js App" (Passenger) | Same as above using Passenger instead of PM2. |
| Shared hosting, no Node | Keep Laravel + MariaDB on existing host (`api.` subdomain). Deploy Next.js to Vercel, point main domain DNS to Vercel. Domain unchanged, no backend migration. |

Queue: `database` driver + cron `schedule:run` (works on shared hosting).
Deploy step: run `php artisan storage:link` once, or product images will not be served.
Backups: daily `mysqldump` + `storage/` via cron, keep 14 days.

---

## 9. Owner Decisions (confirmed 2026-11-16)

| # | Decision |
|---|---|
| 1 | Hosting: **cPanel with Node.js support** → Next.js runs via cPanel "Setup Node.js App" (Passenger), Laravel on same account. Versions still to verify (§8). |
| 2 | Recommendations R1–R10 **approved**. |
| 3 | **Guest checkout only**. No customer accounts in MVP. |
| 4 | Delivery: **Inside Dhaka / Outside Dhaka** zones, each with own charge (admin-editable). |
| 5 | Payments MVP: **Cash on Delivery + bKash manual** (customer sends to Personal or Merchant number, enters TrxID; admin verifies match). **SSLCommerz later** via gateway interface. |
| 6 | Brand assets ready (business running 1+ year on Facebook / Instagram). |

---

## 10. Edge Cases Identified

- Last-item race between two buyers → row lock + 409 response.
- Price changed while item in cart → checkout returns updated totals; customer re-confirms.
- Coupon expires / hits limit between apply and submit → revalidated in transaction.
- Variant archived while in cart → removed with message.
- Order cancelled after shipping → must go through `returned`, not `cancelled`.
- Partial return (1 of 3 items) → per-item return qty + partial refund row.
- Returned item damaged → `return_damaged` movement, no stock increase, cost still counts as loss.
- Manual sale with no customer info → allowed, `customer_id` null.
- Made-to-order with zero stock → allowed, stock goes negative only for that variant, shown in "to produce" list.
- Product deleted with history → soft-delete / archive only; never hard-delete if referenced.
- Duplicate phone formats (+880, 880, 01…) → normalized before save.
- Rounding → percentage discounts rounded to 2 dp at line total, recorded exactly as charged.
- Timezone → store `Asia/Dhaka` for report date boundaries.
