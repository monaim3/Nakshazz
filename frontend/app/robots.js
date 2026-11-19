const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://nakshazz.com").replace(/\/$/, "");

/** /robots.txt: shop pages are open; private and per-customer pages stay out of search. */
export default function robots() {
  const hidden = ["/admin", "/api/", "/checkout", "/order/", "/wishlist"];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...hidden, ...hidden.filter((path) => !path.startsWith("/a")).map((path) => `/bn${path}`)] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
