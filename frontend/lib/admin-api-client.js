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
 * @param {{ method?: string, body?: object|FormData, signal?: AbortSignal }} options
 */
export async function adminFetch(path, { method = "GET", body, signal } = {}, retried = false) {
  const isWrite = method !== "GET";
  if (isWrite) await ensureCsrfCookie();

  const headers = { Accept: "application/json" };
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
    return adminFetch(path, { method, body, signal }, true);
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(response.status, data?.message, data?.errors);
  }

  return data;
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
