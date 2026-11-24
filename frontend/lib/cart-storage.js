"use client";

import { useSyncExternalStore } from "react";

/**
 * Browser cart: [{ variantId, quantity, max?, price? }]. `max` is the most that can be bought
 * (stock, capped per order) and `price` the unit price last quoted to the shopper; both are
 * hints for the UI only. Prices and stock are always re-checked by the server.
 */
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
 * max_quantity from the API and `price` the unit price on screen; the server re-checks stock
 * and price at checkout anyway.
 * Returns the new quantity for that variant.
 */
export function addToCart(variantId, quantity = 1, max = 10, price = undefined) {
  const lines = readCart();
  const line = lines.find((item) => item.variantId === variantId);
  const cap = Math.max(1, Math.min(max, MAX_PER_LINE));
  const next = Math.max(1, Math.min(cap, (line?.quantity || 0) + quantity));
  // the price shown on the page the shopper added it from (kept from an earlier add otherwise)
  const seen = line?.price ?? price;
  const fields = { quantity: next, max: cap, ...(seen != null ? { price: seen } : {}) };
  writeCart(line ? lines.map((item) => (item.variantId === variantId ? { ...item, ...fields } : item)) : [...lines, { variantId, ...fields }]);
  return next;
}

/** Most of this line the shopper may have: the stock seen when it was added (or last quoted). */
export function lineMax(line) {
  return Number.isInteger(line?.max) && line.max > 0 ? Math.min(line.max, MAX_PER_LINE) : MAX_PER_LINE;
}

export function setCartQuantity(variantId, quantity) {
  writeCart(readCart().map((item) => (item.variantId === variantId ? { ...item, quantity: Math.max(1, Math.min(lineMax(item), quantity)) } : item)));
}

/**
 * Bring the bag in line with a server quote (POST /cart/validate lines): remember each line's
 * current unit price, and (unless `stock: false`) lower quantity/max where stock is short. Returns the price changes
 * as [{ variantId, from, to }] so the UI can tell the shopper. Writes only when something changed.
 */
export function syncCartWithQuote(quotedLines, { stock = true } = {}) {
  const byId = new Map((quotedLines || []).map((line) => [line.variant_id, line]));
  const changes = [];
  let dirty = false;
  const next = readCart().map((item) => {
    const info = byId.get(item.variantId);
    if (!info || info.unit_price == null) return item;
    const updated = { ...item };
    if (item.price != null && Number(item.price) !== Number(info.unit_price)) changes.push({ variantId: item.variantId, from: item.price, to: info.unit_price });
    if (item.price == null || Number(item.price) !== Number(info.unit_price)) {
      updated.price = info.unit_price;
      dirty = true;
    }
    if (stock && info.problem === "insufficient_stock" && info.quantity > 0) {
      updated.quantity = info.quantity;
      updated.max = info.quantity;
      dirty = true;
    }
    return updated;
  });
  if (dirty) writeCart(next);
  return changes;
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
