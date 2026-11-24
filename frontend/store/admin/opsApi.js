import { adminApi } from "./api";

/** Owner-only shop operations: daily closing, restock suggestions, activity log. */
export const opsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    closing: build.query({
      query: (date) => ({ url: "/admin/closing", params: { date } }),
      providesTags: ["Closing", "Payment"],
    }),
    saveClosing: build.mutation({
      query: (body) => ({ url: "/admin/closing", method: "POST", body }),
      invalidatesTags: ["Closing", "Activity"],
    }),
    restock: build.query({
      query: () => "/admin/restock",
      providesTags: ["Inventory"],
    }),
    activity: build.query({
      query: (params) => ({ url: "/admin/activity", params }),
      providesTags: ["Activity"],
    }),
  }),
});

export const { useClosingQuery, useSaveClosingMutation, useRestockQuery, useActivityQuery } = opsApi;
