import { createApi } from "@reduxjs/toolkit/query/react";
import { adminFetch, ApiError, toQuery } from "@/lib/admin-api-client";

/**
 * baseQuery adapter: RTK Query → adminFetch.
 * args: "/path" or { url, method, body, params }
 */
async function adminBaseQuery(args, { signal }) {
  const { url, method = "GET", body, params } = typeof args === "string" ? { url: args } : args;

  try {
    const data = await adminFetch(`${url}${toQuery(params)}`, { method, body, signal });
    return { data };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: { status: error.status, message: error.message, errors: error.errors } };
    }
    return { error: { status: "FETCH_ERROR", message: "Cannot reach the server. Check your connection." } };
  }
}

export const adminApi = createApi({
  reducerPath: "adminApi",
  baseQuery: adminBaseQuery,
  tagTypes: [
    "Me", "Dashboard", "Order", "Product", "Category", "Inventory", "Payment",
    "Customer", "Expense", "ExpenseCategory", "Coupon", "Report", "Review",
    "Banner", "Page", "Settings", "User", "Message",
  ],
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    me: build.query({ query: () => "/admin/me", providesTags: ["Me"] }),
    login: build.mutation({
      query: (body) => ({ url: "/admin/login", method: "POST", body }),
      invalidatesTags: ["Me"],
    }),
    logout: build.mutation({ query: () => ({ url: "/admin/logout", method: "POST" }) }),
    dashboard: build.query({
      query: (params) => ({ url: "/admin/dashboard", params }),
      providesTags: ["Dashboard"],
    }),
    // sidebar badges; refreshed every minute and after any order, payment or message change
    alerts: build.query({ query: () => "/admin/alerts", providesTags: ["Dashboard", "Message"] }),
  }),
});

export const { useMeQuery, useLoginMutation, useLogoutMutation, useDashboardQuery, useAlertsQuery } = adminApi;
