export const LOCALES = ["en", "bn"];
export const DEFAULT_LOCALE = "en";

export function hasLocale(value) {
  return LOCALES.includes(value);
}

/**
 * Public URL for a path in a language. English lives at clean URLs ("/shop"),
 * Bangla under "/bn" ("/bn/shop").
 */
export function localePath(lang, path = "/") {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (lang === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${lang}` : `/${lang}${clean}`;
}

/** Strip the language prefix from a pathname: "/bn/shop" → "/shop". */
export function stripLocale(pathname) {
  const [, first, ...rest] = pathname.split("/");
  if (LOCALES.includes(first)) return `/${rest.join("/")}`;
  return pathname || "/";
}

/** Bangla digits for prices/counts on Bangla pages. */
export function localizeDigits(value, lang) {
  if (lang !== "bn") return String(value);
  return String(value).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯"[digit]);
}
