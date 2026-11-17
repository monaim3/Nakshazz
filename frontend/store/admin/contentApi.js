import { adminApi } from "./api";

export const contentApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    customers: build.query({
      query: (params) => ({ url: "/admin/customers", params }),
      providesTags: ["Customer"],
    }),
    customer: build.query({
      query: (id) => `/admin/customers/${id}`,
      providesTags: (result, error, id) => [{ type: "Customer", id }],
    }),
    updateCustomer: build.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/customers/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Customer"],
    }),

    reviews: build.query({
      query: (params) => ({ url: "/admin/reviews", params }),
      providesTags: ["Review"],
    }),
    importReview: build.mutation({
      query: (body) => ({ url: "/admin/reviews", method: "POST", body }),
      invalidatesTags: ["Review"],
    }),
    updateReview: build.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/reviews/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Review"],
    }),
    deleteReview: build.mutation({
      query: (id) => ({ url: `/admin/reviews/${id}`, method: "DELETE" }),
      invalidatesTags: ["Review"],
    }),

    banners: build.query({
      query: () => "/admin/banners",
      providesTags: ["Banner"],
    }),
    saveBanner: build.mutation({
      query: ({ id, formData }) => ({ url: id ? `/admin/banners/${id}` : "/admin/banners", method: "POST", body: formData }),
      invalidatesTags: ["Banner"],
    }),
    deleteBanner: build.mutation({
      query: (id) => ({ url: `/admin/banners/${id}`, method: "DELETE" }),
      invalidatesTags: ["Banner"],
    }),
    pages: build.query({
      query: () => "/admin/pages",
      providesTags: ["Page"],
    }),
    updatePage: build.mutation({
      query: ({ slug, ...body }) => ({ url: `/admin/pages/${slug}`, method: "PUT", body }),
      invalidatesTags: ["Page"],
    }),

    messages: build.query({
      query: (params) => ({ url: "/admin/messages", params }),
      providesTags: ["Message"],
    }),
    markMessageRead: build.mutation({
      query: (id) => ({ url: `/admin/messages/${id}/read`, method: "POST" }),
      invalidatesTags: ["Message"],
    }),
  }),
});

export const {
  useCustomersQuery,
  useCustomerQuery,
  useUpdateCustomerMutation,
  useReviewsQuery,
  useImportReviewMutation,
  useUpdateReviewMutation,
  useDeleteReviewMutation,
  useBannersQuery,
  useSaveBannerMutation,
  useDeleteBannerMutation,
  usePagesQuery,
  useUpdatePageMutation,
  useMessagesQuery,
  useMarkMessageReadMutation,
} = contentApi;
