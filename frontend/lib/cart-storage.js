"use client";

import { useSyncExternalStore } from "react";

/** Browser cart: [{ variantId, quantity }]. Prices are always re-checked by the server. */
export const CART_KEY = "nakshazz-cart-v1";
const EVENT = "nakshazz-cart-change";
const OPEN_EVENT = "nakshazz-cart-open";
const MAX_PER_LINE = 20; // matches the API's CartRequest limit
const EMPTY = [];

let cachedRaw = null;
let cachedLines = EMPTY;

export function readCart() {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(CART_KEY) || "[]";
    if (raw !== cachedRaw) {
      // same array while storage is unchanged (useSyncExternalStore needs a stable snapshot)
      const parsed = JSON.parse(raw);
      cachedRaw = raw;
      cachedLines = Array.isArray(parsed) ? parsed.filter((line) => Number.isInteger(line.variantId) && line.quantity > 0) : EMPTY;
    }
    return cachedLines;
  } catch {
    return EMPTY;
  }
}

export function writeCart(lines) {
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(lines));
  } catch {
    // storage blocked: nothing more we can do in the browser
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Add a variant to the cart, merging with an existing line. `max` is the variant's
 * max_quantity from the API; the server re-checks stock and price at checkout anyway.
 * Returns the new quantity for that variant.
 */
export function addToCart(variantId, quantity = 1, max = 10) {
  const lines = readCart();
  const line = lines.find((item) => item.variantId === variantId);
  const next = Math.max(1, Math.min(max, MAX_PER_LINE, (line?.quantity || 0) + quantity));
  writeCart(line ? lines.map((item) => (item.variantId === variantId ? { ...item, quantity: next } : item)) : [...lines, { variantId, quantity: next }]);
  return next;
}

export function setCartQuantity(variantId, quantity) {
  const next = Math.max(1, Math.min(MAX_PER_LINE, quantity));
  writeCart(readCart().map((item) => (item.variantId === variantId ? { ...item, quantity: next } : item)));
}

export function removeFromCart(variantId) {
  writeCart(readCart().filter((item) => item.variantId !== variantId));
}

/** Ask the bag drawer (mounted once in the store layout) to open. */
export function openCartDrawer() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onCartDrawerOpen(callback) {
  window.addEventListener(OPEN_EVENT, callback);
  return () => window.removeEventListener(OPEN_EVENT, callback);
}

function subscribe(callback) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function countSnapshot() {
  return readCart().reduce((sum, line) => sum + line.quantity, 0);
}

export function useCart() {
  return useSyncExternalStore(subscribe, readCart, () => EMPTY);
}

export function useCartCount() {
  return useSyncExternalStore(subscribe, countSnapshot, () => 0);
}
