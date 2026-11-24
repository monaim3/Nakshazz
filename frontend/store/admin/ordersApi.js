import { adminApi } from "./api";

/**
 * Orders, manual sales and payments. Every write invalidates the order list,
 * the dashboard and stock, so all screens stay in sync without manual refresh.
 */
const affected = ["Order", "Dashboard", "Inventory", "Payment", "Customer", "Report"];

export const ordersApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    orders: build.query({
      query: (params) => ({ url: "/admin/orders", params }),
      providesTags: ["Order"],
    }),
    order: build.query({
      query: (id) => `/admin/orders/${id}`,
      providesTags: (result, error, id) => [{ type: "Order", id }],
    }),
    updateOrderStatus: build.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/orders/${id}/status`, method: "POST", body }),
      invalidatesTags: affected,
    }),
    updateOrderShipping: build.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/orders/${id}/shipping`, method: "PATCH", body }),
      invalidatesTags: ["Order"],
    }),
    addOrderNote: build.mutation({
      query: ({ id, body }) => ({ url: `/admin/orders/${id}/notes`, method: "POST", body: { body } }),
      invalidatesTags: (result, error, { id }) => [{ type: "Order", id }],
    }),
    // write mutations take an optional `idempotencyKey` (see newIdempotencyKey)
    returnOrderItems: build.mutation({
      query: ({ id, idempotencyKey, ...body }) => ({ url: `/admin/orders/${id}/returns`, method: "POST", body, idempotencyKey }),
      invalidatesTags: affected,
    }),
    createManualSale: build.mutation({
      query: ({ idempotencyKey, ...body }) => ({ url: "/admin/manual-sales", method: "POST", body, idempotencyKey }),
      invalidatesTags: affected,
    }),

    pendingPayments: build.query({
      query: () => "/admin/payments/pending",
      providesTags: ["Payment"],
    }),
    recordPayment: build.mutation({
      query: ({ orderId, idempotencyKey, ...body }) => ({ url: `/admin/orders/${orderId}/payments`, method: "POST", body, idempotencyKey }),
      invalidatesTags: affected,
    }),
    verifyPayment: build.mutation({
      // amount = what really arrived (when the customer sent less or more)
      query: ({ id, fee, amount }) => ({ url: `/admin/payments/${id}/verify`, method: "POST", body: { fee, amount } }),
      invalidatesTags: affected,
    }),
    rejectPayment: build.mutation({
      query: ({ id, note }) => ({ url: `/admin/payments/${id}/reject`, method: "POST", body: { note } }),
      invalidatesTags: affected,
    }),
    refundOrder: build.mutation({
      query: ({ orderId, idempotencyKey, ...body }) => ({ url: `/admin/orders/${orderId}/refunds`, method: "POST", body, idempotencyKey }),
      invalidatesTags: [...affected, "Closing"],
    }),

    /** Product search for the POS screen (variants include live stock). */
    productSearch: build.query({
      query: (q) => ({ url: "/admin/products", params: { q, status: "active", per_page: 12 } }),
      providesTags: ["Product", "Inventory"],
    }),
    settings: build.query({
      query: () => "/admin/settings",
      providesTags: ["Settings"],
    }),
  }),
});

export const {
  useOrdersQuery,
  useOrderQuery,
  useUpdateOrderStatusMutation,
  useUpdateOrderShippingMutation,
  useAddOrderNoteMutation,
  useReturnOrderItemsMutation,
  useCreateManualSaleMutation,
  usePendingPaymentsQuery,
  useRecordPaymentMutation,
  useVerifyPaymentMutation,
  useRejectPaymentMutation,
  useRefundOrderMutation,
  useProductSearchQuery,
  useSettingsQuery,
} = ordersApi;
