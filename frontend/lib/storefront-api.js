import { cacheLife, cacheTag } from "next/cache";

/**
 * Server-side, cached reads from the Laravel public API.
 * Cache tags match the tags Laravel sends to /api/revalidate after admin edits,
 * so a product change refreshes its page within seconds; otherwise pages refresh hourly.
 */
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

// The API only answers our own website: this server proves itself with a shared key
// (server-only env, never sent to browsers; browsers are recognised by the page's origin).
const HEADERS = { Accept: "application/json", ...(process.env.STOREFRONT_API_KEY ? { "X-Storefront-Key": process.env.STOREFRONT_API_KEY } : {}) };

/** fetch with retries: the shared host occasionally drops a connection under load. */
async function fetchWithRetry(url, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function apiGet(path) {
  const response = await fetchWithRetry(`${API_URL}${path}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${response.status} for ${path}`);
  return (await response.json()).data;
}

/**
 * For data every page needs, "no answer" means the API is down or something else is on its
 * address, not that the thing does not exist. Throwing (instead of returning null) keeps that
 * empty answer out of the hour-long cache, so the shop recovers as soon as the API is back.
 */
async function apiGetRequired(path) {
  const data = await apiGet(path);
  if (data == null) throw new Error(`API returned no data for ${path}`);
  return data;
}

export async function getSettings() {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");
  return apiGetRequired("/settings");
}

export async function getHome() {
  "use cache";
  cacheLife("hours");
  cacheTag("home", "products", "categories");
  return apiGetRequired("/home");
}

export async function getCategories() {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");
  return apiGetRequired("/categories");
}

export async function getProduct(slug) {
  "use cache";
  cacheLife("hours");
  cacheTag("products", `product:${slug}`);
  return apiGet(`/products/${encodeURIComponent(slug)}`);
}

export async function getPage(slug) {
  "use cache";
  cacheLife("days");
  cacheTag(`page:${slug}`);
  return apiGet(`/pages/${encodeURIComponent(slug)}`);
}

/** Full paginated response ({ data, meta }) for the listing endpoints. */
async function apiGetPage(path) {
  const response = await fetchWithRetry(`${API_URL}${path}`);
  if (!response.ok) throw new Error(`API ${response.status} for ${path}`);
  return response.json();
}

/**
 * Product listing (shop, category pages). `query` keys: q, category, sort, min_price,
 * max_price, in_stock, featured, page, per_page. Cached per distinct query.
 */
export async function getProducts(query = {}) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ""));
  return apiGetPage(`/products?${params}`);
}

export async function getCategory(slug) {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");
  return apiGet(`/categories/${encodeURIComponent(slug)}`);
}

export async function getProductReviews(slug) {
  "use cache";
  cacheLife("hours");
  cacheTag("reviews", `product:${slug}`);
  return (await apiGet(`/products/${encodeURIComponent(slug)}/reviews`)) || [];
}

/** Sidebar facets: price bounds, colours with counts, on-sale count. */
export async function getFacets(category) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  return apiGet(`/products/facets${category ? `?category=${encodeURIComponent(category)}` : ""}`);
}

/** Slugs + last-changed dates of every public page, for /sitemap.xml. */
export async function getSitemap() {
  "use cache";
  cacheLife("hours");
  cacheTag("products", "categories");
  return apiGet("/sitemap");
}
