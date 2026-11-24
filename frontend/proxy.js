import { NextResponse } from "next/server";

const LOCALES = ["en", "bn"];
const DEFAULT_LOCALE = "en";

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
const API_HEADERS = { Accept: "application/json", ...(process.env.STOREFRONT_API_KEY ? { "X-Storefront-Key": process.env.STOREFRONT_API_KEY } : {}) };
const DETAIL_PAGE = /^\/(product|category)\/([^/]+)\/?$/;
const ENDPOINT = { product: "products", category: "categories" };
const known = new Map(); // "product:slug" -> { exists, until }

/**
 * Does this product/category exist? With Cache Components the page shell (status 200) is sent
 * before the page can call notFound(), so a real 404 status has to be decided here, before
 * rendering. Answers are remembered briefly; if the API can't answer we let the page decide.
 */
async function exists(kind, slug) {
  const key = `${kind}:${slug}`;
  const hit = known.get(key);
  if (hit && hit.until > Date.now()) return hit.exists;
  try {
    const response = await fetch(`${API_URL}/${ENDPOINT[kind]}/${encodeURIComponent(slug)}`, { headers: API_HEADERS, signal: AbortSignal.timeout(4000) });
    if (response.status !== 404 && !response.ok) return true;
    const found = response.status !== 404;
    if (known.size > 2000) known.clear();
    known.set(key, { exists: found, until: Date.now() + (found ? 5 * 60_000 : 60_000) });
    return found;
  } catch {
    return true;
  }
}

/** Full page loads only: client navigations and prefetches don't need an HTTP status. */
function isDocumentRequest(request) {
  return (request.method === "GET" || request.method === "HEAD") && !request.headers.has("rsc") && !request.headers.has("next-router-prefetch");
}

/**
 * Language routing.
 *  /shop        → served from the internal /en/shop route (URL stays clean)
 *  /bn/shop     → Bangla, served as-is
 *  /en/shop     → 308 redirect to /shop, so every page has one canonical URL
 */
export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (first === DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(DEFAULT_LOCALE.length + 1) || "/";
    return NextResponse.redirect(url, 308);
  }

  const localized = LOCALES.includes(first);
  const url = request.nextUrl.clone();
  if (!localized) url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;

  // Unknown product / category: same page (it renders the shop's not-found UI), 404 status.
  const detail = (localized ? pathname.slice(first.length + 1) : pathname).match(DETAIL_PAGE);
  if (detail && API_URL && isDocumentRequest(request) && !(await exists(detail[1], decodeURIComponent(detail[2])))) {
    return NextResponse.rewrite(url, { status: 404 });
  }

  return localized ? NextResponse.next() : NextResponse.rewrite(url);
}

export const config = {
  // Skip admin, API routes, Next internals and any file with an extension (images, icons, robots.txt…).
  matcher: ["/((?!admin|api|_next|.*\\..*).*)"],
};
