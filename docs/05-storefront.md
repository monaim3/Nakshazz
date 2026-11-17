# Nakshazz — Phase 5: Customer Storefront

Status: **design direction approved (reference: luxury fine-jewellery look), in implementation**
Date: 2026-11-17

---

## 1. Design direction

Owner reference: full-bleed photo hero, centred serif wordmark, uppercase spaced menu, script + serif headline. Colours come from the নকসাজ logo (owner request, 2026-11-17): bold, modern, eye-catching, while ivory backgrounds keep jewellery photos clean.

### Palette (from the logo)

| Token | Hex | Logo source | Use |
|---|---|---|---|
| `ivory-50/100/200` | `#FFFCF6` / `#FBF5EA` / `#F4EAD8` | — | Page background, bands, borders |
| `navy-900` | `#0F1B35` | Badge frame | Headings, wordmark, footer, review band, dark buttons |
| `navy-950` | `#0A1226` | Badge frame | Fallback hero background |
| `lotus-500` | `#D11E58` | Lotus flower | Primary CTA (pill buttons), cart count, sale prices/badges |
| `marigold-400` | `#EBBD33` | Lettering / flowers | Dotted folk rule, stars, gold details |
| `marigold-500` | `#E9A02E` | Lettering shadow (saffron) | Gradient stop |
| `teal-400/500` | `#40A796` / `#238A9B` | Inner line / wave | Small accents, story band tint |
| `ink` | `#17203A` | — | Body text |

Utilities: `bg-brand-gradient` / `text-brand-gradient` (lotus → saffron → marigold), `brand-strip` (3px lotus/marigold/teal line on header and footer), `folk-rule` (marigold dots). Use the gradient sparingly: hero title, nav underline, highlights. Buttons are solid lotus pills; secondary buttons navy.

### Typography

| Role | Font | Notes |
|---|---|---|
| Wordmark & headings | Cormorant Garamond | Elegant serif, like the reference |
| Script accents | Pinyon Script | One or two words per hero only |
| Menu, buttons, body | Jost | Uppercase + letter-spacing for nav/buttons |
| Bangla | Hind Siliguri | Loaded only on `/bn` pages |

All fonts self-hosted by `next/font` (no layout shift, no third-party request).

---

## 2. Languages

- English default at clean URLs: `/`, `/shop`, `/product/kundan-jhumka`.
- Bangla at `/bn/...` with the same pages. Header has an EN / বাংলা switch.
- `proxy.js` rewrites unprefixed URLs to the internal `/en` route; `/en/...` redirects to the clean URL (one canonical URL per page).
- Each page outputs `hreflang` alternates for Google.
- UI text comes from dictionaries (`en.json`, `bn.json`). Product names/descriptions are shown as entered in admin (Bangla product fields can be added later without route changes).

---

## 3. Pages & rendering

| Page | Route | Rendering |
|---|---|---|
| Home | `/` | Cached (`use cache`, tag `home`), refreshed by admin changes |
| Shop / search / filters | `/shop?category=&q=&sort=&min=&max=` | Static shell + streamed results |
| Category | `/category/[slug]` | Cached per category |
| Product | `/product/[slug]` | Cached per product + JSON-LD Product schema |
| Cart (bag) | `/cart` | Client (browser cart, server re-price) |
| Checkout | `/checkout` | Client form → API |
| Order confirmation | `/order/[uuid]` | Request-time |
| Track order | `/track-order` | Client form → API |
| About, Contact, Privacy, Return & Refund, Delivery | `/about`, `/contact`, `/policies/[slug]` | Cached, markdown from admin |

Admin edits call `/api/revalidate` (shared secret) → matching cache tags refresh within seconds.

---

## 4. Speed & SEO checklist

- Images: API serves WebP in 400/800/1600 px; `<img srcset>` picks the right size; lazy below the fold; hero image preloaded.
- No client JS on content pages except small islands (cart button, gallery, add-to-bag).
- Metadata per page, canonical URLs, Open Graph images, `sitemap.xml`, `robots.txt`, Product + Breadcrumb + Organization structured data.
- Accessible: semantic landmarks, focus styles, colour contrast AA, reduced-motion respected.

---

## 5. Edge cases

- Product sold out / made-to-order → button text and stock note change; still indexable.
- Variant out of stock → option disabled with "sold out".
- Cart item price changed or removed → bag shows the change before checkout.
- API down → cached pages still serve; checkout shows a friendly retry message.
- Bangla page for content with no Bangla text → English text shown, UI in Bangla.

### Hero (branch, 2026-11-17)

`components/store/Hero3D.js`, on the logo navy (owner reference: earrings hanging on a branch). An SVG leafy branch slides in from the left; real cut-out earrings fly in from the right, catch on it by their hooks and swing to rest (pendulum keyframes, origin at the hooks), then sway; leaves sway. Pieces alternate every 6 s in an endless loop, never paused (aqua agate / tasselled wooden bead, `public/hero/branch-*-v2.webp`, cut from owner photos taken on a branch, branch removed; the SVG branch covers the hook tops).

- Minimal text: one modern gold pill button (smooth gold→saffron gradient, sentence-case label, arrow in a navy circle that turns on hover, light sweep + soft gold glow) and two dots. The giant wordmark was removed at the owner's request (the `text-logo-gold` utility stays available).
- `--top` on the section sets the branch line (below the header). Earrings are as large as possible: they fill the space between the branch and the button, capped at 620px and at 84vw wide. Leaves above the branch stay low (clear of the menu); none hang over the earrings.
- A rain scene (leaf dripping on a chandbali) was tried and removed at the owner's request.
- Hero images are versioned (`*-v2.webp`): Next's image optimizer caches by URL, so a replaced file needs a new name.
- Keyframes `hero-*` in `app/globals.css`. `<body suppressHydrationWarning>` silences browser-extension attributes (ColorZilla) in dev.

Cut-outs: made locally with `rembg` (ISNet) from `photos/products`; need sharp originals (≥1500 px) on plain backgrounds.

### Categories (2026-11-17)

Based on the owner's real collection (photos in `photos/products`): **Bead Earrings**, **Chandbali & Jhumka**, **Clay Earrings**, **Resin Jewellery**, **Necklaces**, each with a cover photo (square crop from an owner photo, stored via `ImageProcessor::storeSingle`, 800px WebP). Demo products were re-assigned to match. The header menu shows Shop, all (up to 5) categories, Our Story, Contact; "New Arrivals" lives in the mobile drawer, the footer and the homepage section. Owners can rename categories or change covers in Admin → Categories.

### Falling petals (2026-11-17)

Same effect as the nakshazz.com coming-soon page: leaf-shaped petals (`rounded-[0_100%]`) in the logo colours (lotus, gold, teal, saffron) drift down and spin, only along the outer left/right edges (≤8% / ≥92%) of the **Shop by Category** and **Our Story** sections (`components/store/FallingPetals.js`). Fixed positions (no `Math.random`, so no hydration mismatch), hidden for reduced motion. Keyframes `petal-fall` / `petal-sway` are top-level in `globals.css`: keyframes declared inside `@theme` are only emitted when Tailwind detects them, and these were being dropped.

### Quick view & favourites (2026-11-17)

- **Product card** (`ProductCard.js`, rounded-2xl): image + title are links; the interactive layer `ProductCardActions.js` sits on top, outside the links (no buttons inside `<a>`). Heart top-right; "Quick view" bar slides up on hover (desktop) or a small eye button bottom-right (touch).
- **Quick view** (`QuickView.js`): native `<dialog>` (focus trap, Esc, backdrop click closes), mounted only once opened. Fetches `/products/{slug}` client-side: gallery with thumbnails, category, price (per variant), stock badge (in stock / only N left / made to order / sold out, from `stock_status` + `low_stock_count`), option chips (only when variants differ), quantity stepper capped at `max_quantity`, Add to bag (`addToCart` in `lib/cart-storage.js`, merges lines), heart, "View full details".
- **Favourites** (`lib/wishlist-storage.js`): browser-only (guest shop, no accounts), localStorage `nakshazz-wishlist-v1`, max 100, each entry a card snapshot so `/wishlist` renders without an API call. `useSyncExternalStore` with a cached snapshot. Header heart with count (lotus badge). `/wishlist` page is `noindex`. EN/BN text in dictionaries (`product.*`, `nav.favourites`, `wishlist.*`).
- **Variant picker** (`VariantPicker.js`, used by quick view and later the product page): a single colour/metal option ("Color", "Metal", "Finish", "রং") with known values renders round swatches ("COLOR Golden"); metals use gradients (`lib/swatches.js`: golden, antique gold, silver, oxidised, rose gold, copper, bronze, plus plain colours and Bangla names). Unknown values fall back to text chips. Sold-out variants are crossed out. Choosing a variant jumps to its own photo when one is linked to it.
