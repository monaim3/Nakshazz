import { getSitemap } from "@/lib/storefront-api";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://nakshazz.com").replace(/\/$/, "");

/** One entry per page, with its Bangla twin so search engines pair the two languages. */
function entry(path, lastModified) {
  const en = `${SITE_URL}${path === "/" ? "" : path}`;
  const bn = `${SITE_URL}/bn${path === "/" ? "" : path}`;
  return { url: en || SITE_URL, lastModified, alternates: { languages: { en: en || SITE_URL, bn } } };
}

/** /sitemap.xml: every public page. Refreshes with the catalogue (cache tags) or hourly. */
export default async function sitemap() {
  const data = (await getSitemap().catch(() => null)) || {};
  return [
    entry("/"),
    entry("/shop"),
    entry("/contact"),
    entry("/track-order"),
    ...(data.categories || []).map((item) => entry(`/category/${item.slug}`, item.updated_at)),
    ...(data.products || []).map((item) => entry(`/product/${item.slug}`, item.updated_at)),
    ...(data.pages || []).map((item) => entry(item.slug === "about" ? "/about" : `/policies/${item.slug}`, item.updated_at)),
  ];
}
