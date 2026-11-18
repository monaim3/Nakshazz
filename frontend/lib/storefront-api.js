import { cacheLife, cacheTag } from "next/cache";

/**
 * Server-side, cached reads from the Laravel public API.
 * Cache tags match the tags Laravel sends to /api/revalidate after admin edits,
 * so a product change refreshes its page within seconds; otherwise pages refresh hourly.
 */
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

async function apiGet(path) {
  const response = await fetch(`${API_URL}${path}`, { headers: { Accept: "application/json" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${response.status} for ${path}`);
  return (await response.json()).data;
}

export async function getSettings() {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");
  return apiGet("/settings");
}

export async function getHome() {
  "use cache";
  cacheLife("hours");
  cacheTag("home", "products", "categories");
  return apiGet("/home");
}

export async function getCategories() {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");
  return (await apiGet("/categories")) || [];
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
  const response = await fetch(`${API_URL}${path}`, { headers: { Accept: "application/json" } });
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
