import { NextResponse } from "next/server";

const LOCALES = ["en", "bn"];
const DEFAULT_LOCALE = "en";

/**
 * Language routing.
 *  /shop        → served from the internal /en/shop route (URL stays clean)
 *  /bn/shop     → Bangla, served as-is
 *  /en/shop     → 308 redirect to /shop, so every page has one canonical URL
 */
export function proxy(request) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (first === DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(DEFAULT_LOCALE.length + 1) || "/";
    return NextResponse.redirect(url, 308);
  }

  if (LOCALES.includes(first)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip admin, API routes, Next internals and any file with an extension (images, icons, robots.txt…).
  matcher: ["/((?!admin|api|_next|.*\\..*).*)"],
};
