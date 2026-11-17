"use client";

import { useSyncExternalStore } from "react";

/**
 * Favourites live in the browser (guest shop, no customer accounts). Each entry keeps a small
 * snapshot of the card so the favourites page renders without an API call; prices shown there
 * are refreshed from the server when the customer opens the product.
 */
const KEY = "nakshazz-wishlist-v1";
const EVENT = "nakshazz-wishlist-change";
const EMPTY = [];

let cachedRaw = null;
let cachedList = EMPTY;

export function readWishlist() {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY) || "[]";
    if (raw !== cachedRaw) {
      // keep the same array while storage is unchanged (useSyncExternalStore needs a stable snapshot)
      const parsed = JSON.parse(raw);
      cachedRaw = raw;
      cachedList = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.slug === "string") : EMPTY;
    }
    return cachedList;
  } catch {
    return EMPTY;
  }
}

function write(list) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100)));
  } catch {
    // storage full or blocked: favourites are a convenience, so fail quietly
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Snapshot of a product card (API ProductCardResource shape). */
function snapshot(product) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    compare_at_price: product.compare_at_price ?? null,
    has_price_range: Boolean(product.has_price_range),
    in_stock: product.in_stock !== false,
    image: product.image ? { alt: product.image.alt, urls: product.image.urls } : null,
  };
}

export function toggleWishlist(product) {
  const list = readWishlist();
  const exists = list.some((item) => item.slug === product.slug);
  write(exists ? list.filter((item) => item.slug !== product.slug) : [snapshot(product), ...list]);
  return !exists;
}

export function removeFromWishlist(slug) {
  write(readWishlist().filter((item) => item.slug !== slug));
}

function subscribe(callback) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useWishlist() {
  return useSyncExternalStore(subscribe, readWishlist, () => EMPTY);
}

export function useIsFavourite(slug) {
  return useSyncExternalStore(
    subscribe,
    () => readWishlist().some((item) => item.slug === slug),
    () => false,
  );
}

export function useWishlistCount() {
  return useSyncExternalStore(subscribe, () => readWishlist().length, () => 0);
}
