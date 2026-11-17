"use client";

import { useSyncExternalStore } from "react";

/** Browser cart: [{ variantId, quantity }]. Prices are always re-checked by the server. */
export const CART_KEY = "nakshazz-cart-v1";
const EVENT = "nakshazz-cart-change";

export function readCart() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((line) => Number.isInteger(line.variantId) && line.quantity > 0) : [];
  } catch {
    return [];
  }
}

export function writeCart(lines) {
  window.localStorage.setItem(CART_KEY, JSON.stringify(lines));
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
  const next = Math.max(1, Math.min(max, (line?.quantity || 0) + quantity));
  writeCart(line ? lines.map((item) => (item.variantId === variantId ? { ...item, quantity: next } : item)) : [...lines, { variantId, quantity: next }]);
  return next;
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

export function useCartCount() {
  return useSyncExternalStore(subscribe, countSnapshot, () => 0);
}
