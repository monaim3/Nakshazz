/**
 * Browser-side client for the Laravel admin API.
 * Auth = Sanctum session cookie (httpOnly) + XSRF token cookie echoed back in a header.
 * Nothing secret is stored in localStorage.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export class ApiError extends Error {
  constructor(status, message, errors = {}) {
    super(message || "Something went wrong.");
    this.status = status;
    this.errors = errors;
  }
}

function readXsrfToken() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((row) => row.startsWith("XSRF-TOKEN="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

let csrfPromise = null;
export function ensureCsrfCookie(force = false) {
  if (!force && readXsrfToken()) return Promise.resolve();
  csrfPromise ??= fetch(`${BACKEND_URL}/sanctum/csrf-cookie`, { credentials: "include" }).finally(() => {
    csrfPromise = null;
  });
  return csrfPromise;
}

/**
 * @param {string} path  e.g. "/admin/orders?status=pending"
 * @param {{ method?: string, body?: object|FormData, signal?: AbortSignal, idempotencyKey?: string }} options
 */
export async function adminFetch(path, { method = "GET", body, signal, idempotencyKey } = {}, retried = false) {
  const isWrite = method !== "GET";
  if (isWrite) await ensureCsrfCookie();

  const headers = { Accept: "application/json" };
  // same key for every retry of one attempt → the server does it once (no double sale / payment)
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const xsrf = readXsrfToken();
  if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;

  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: payload,
    credentials: "include",
    signal,
  });

  // 419 = CSRF token expired: refresh it once and retry.
  if (response.status === 419 && !retried) {
    await ensureCsrfCookie(true);
    return adminFetch(path, { method, body, signal, idempotencyKey }, true);
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(response.status, data?.message, data?.errors);
  }

  return data;
}

/** A fresh key for one save attempt (keep it for retries, make a new one after success). */
export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Download a file (CSV export) with the login cookie and save it in the browser.
 * @param {string} path e.g. "/admin/exports/orders?from=2026-11-01"
 */
export async function adminDownload(path, fallbackName = "export.csv") {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include", headers: { Accept: "text/csv, application/json" } });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.message || "Download failed.", data?.errors);
  }
  const disposition = response.headers.get("content-disposition") || "";
  const name = disposition.match(/filename="?([^";]+)"?/)?.[1] || fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Turn {a: 1, b: null, c: ""} into "?a=1" (skips empty values). */
export function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** First validation message per field, for react-hook-form setError. */
export function applyServerErrors(error, setError) {
  if (!(error instanceof ApiError) || !error.errors) return false;
  Object.entries(error.errors).forEach(([field, messages]) => {
    setError(field, { type: "server", message: messages[0] });
  });
  return Object.keys(error.errors).length > 0;
}
