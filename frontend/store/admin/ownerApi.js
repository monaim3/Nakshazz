import { adminApi } from "./api";

/** Owner-only endpoints: reports, expenses, coupons, staff and store settings. */
export const ownerApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    reportSummary: build.query({
      query: (params) => ({ url: "/admin/reports/summary", params }),
      providesTags: ["Report"],
    }),
    reportChannels: build.query({
      query: (params) => ({ url: "/admin/reports/channels", params }),
      providesTags: ["Report"],
    }),
    reportProducts: build.query({
      query: (params) => ({ url: "/admin/reports/products", params }),
      providesTags: ["Report"],
    }),
    reportMonthly: build.query({
      query: (params) => ({ url: "/admin/reports/monthly", params }),
      providesTags: ["Report"],
    }),

    expenses: build.query({
      query: (params) => ({ url: "/admin/expenses", params }),
      providesTags: ["Expense"],
    }),
    saveExpense: build.mutation({
      // FormData (optional receipt file). Updates use POST /expenses/{id}.
      query: ({ id, formData }) => ({ url: id ? `/admin/expenses/${id}` : "/admin/expenses", method: "POST", body: formData }),
      invalidatesTags: ["Expense", "Report", "Dashboard"],
    }),
    deleteExpense: build.mutation({
      query: (id) => ({ url: `/admin/expenses/${id}`, method: "DELETE" }),
      invalidatesTags: ["Expense", "Report", "Dashboard"],
    }),
    expenseCategories: build.query({
      query: () => "/admin/expense-categories",
      providesTags: ["ExpenseCategory"],
    }),
    saveExpenseCategory: build.mutation({
      query: ({ id, ...body }) => ({ url: id ? `/admin/expense-categories/${id}` : "/admin/expense-categories", method: id ? "PATCH" : "POST", body }),
      invalidatesTags: ["ExpenseCategory"],
    }),

    coupons: build.query({
      query: (params) => ({ url: "/admin/coupons", params }),
      providesTags: ["Coupon"],
    }),
    saveCoupon: build.mutation({
      query: ({ id, ...body }) => ({ url: id ? `/admin/coupons/${id}` : "/admin/coupons", method: id ? "PUT" : "POST", body }),
      invalidatesTags: ["Coupon"],
    }),
    deleteCoupon: build.mutation({
      query: (id) => ({ url: `/admin/coupons/${id}`, method: "DELETE" }),
      invalidatesTags: ["Coupon"],
    }),

    users: build.query({
      query: () => "/admin/users",
      providesTags: ["User"],
    }),
    saveUser: build.mutation({
      query: ({ id, ...body }) => ({ url: id ? `/admin/users/${id}` : "/admin/users", method: id ? "PATCH" : "POST", body }),
      invalidatesTags: ["User"],
    }),

    updateSettings: build.mutation({
      query: (formData) => ({ url: "/admin/settings", method: "POST", body: formData }),
      invalidatesTags: ["Settings", "Dashboard"],
    }),
    saveDeliveryZone: build.mutation({
      query: ({ id, ...body }) => ({ url: id ? `/admin/delivery-zones/${id}` : "/admin/delivery-zones", method: id ? "PATCH" : "POST", body }),
      invalidatesTags: ["Settings"],
    }),
  }),
});

export const {
  useReportSummaryQuery,
  useReportChannelsQuery,
  useReportProductsQuery,
  useReportMonthlyQuery,
  useExpensesQuery,
  useSaveExpenseMutation,
  useDeleteExpenseMutation,
  useExpenseCategoriesQuery,
  useSaveExpenseCategoryMutation,
  useCouponsQuery,
  useSaveCouponMutation,
  useDeleteCouponMutation,
  useUsersQuery,
  useSaveUserMutation,
  useUpdateSettingsMutation,
  useSaveDeliveryZoneMutation,
} = ownerApi;
