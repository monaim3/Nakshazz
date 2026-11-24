"use client";

import { useSyncExternalStore } from "react";

/**
 * Orders placed on this device (guest shop, no customer accounts), so a customer who comes
 * back a day later finds them on Track order without the order number. Only the order number,
 * the private order link id, the total and the date are kept; the order page itself is
 * loaded from the server. Saved only when "Remember my details" is ticked at checkout.
 */
const KEY = "nakshazz-recent-orders-v1";
const EVENT = "nakshazz-recent-orders-change";
const EMPTY = [];
const MAX = 10;

let cachedRaw = null;
let cachedList = EMPTY;

export function readRecentOrders() {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY) || "[]";
    if (raw !== cachedRaw) {
      const parsed = JSON.parse(raw);
      cachedRaw = raw;
      cachedList = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.uuid === "string" && typeof item.order_number === "string") : EMPTY;
    }
    return cachedList;
  } catch {
    return EMPTY;
  }
}

function write(list) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // storage full or blocked: this list is a convenience, so fail quietly
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Remember an order just placed (CustomerOrderResource shape). */
export function rememberOrder(order) {
  if (!order?.uuid || !order?.order_number) return;
  const entry = {
    uuid: order.uuid,
    order_number: order.order_number,
    grand_total: order.totals?.grand_total ?? order.grand_total ?? null,
    placed_at: order.placed_at ?? new Date().toISOString(),
  };
  write([entry, ...readRecentOrders().filter((item) => item.uuid !== order.uuid)]);
}

export function forgetRecentOrders() {
  write([]);
}

function subscribe(callback) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useRecentOrders() {
  return useSyncExternalStore(subscribe, readRecentOrders, () => EMPTY);
}
