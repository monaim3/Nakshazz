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
