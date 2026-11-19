import { adminApi } from "./api";

export const catalogApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    products: build.query({
      query: (params) => ({ url: "/admin/products", params }),
      providesTags: ["Product"],
    }),
    product: build.query({
      query: (id) => `/admin/products/${id}`,
      providesTags: (result, error, id) => [{ type: "Product", id }],
    }),
    createProduct: build.mutation({
      query: (body) => ({ url: "/admin/products", method: "POST", body }),
      invalidatesTags: ["Product", "Inventory", "Dashboard"],
    }),
    updateProduct: build.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/products/${id}`, method: "PUT", body }),
      invalidatesTags: (result, error, { id }) => ["Product", { type: "Product", id }, "Inventory", "Dashboard"],
    }),
    deleteProduct: build.mutation({
      query: (id) => ({ url: `/admin/products/${id}`, method: "DELETE" }),
      invalidatesTags: ["Product", "Inventory", "Dashboard"],
    }),
    uploadProductImages: build.mutation({
      query: ({ productId, formData }) => ({ url: `/admin/products/${productId}/images`, method: "POST", body: formData }),
      invalidatesTags: (result, error, { productId }) => ["Product", { type: "Product", id: productId }],
    }),
    updateProductImage: build.mutation({
      query: ({ id, productId, ...body }) => ({ url: `/admin/images/${id}`, method: "PATCH", body }),
      invalidatesTags: (result, error, { productId }) => ["Product", { type: "Product", id: productId }],
    }),
    uploadTryOnImage: build.mutation({
      query: ({ productId, formData }) => ({ url: `/admin/products/${productId}/tryon`, method: "POST", body: formData }),
      invalidatesTags: (result, error, { productId }) => ["Product", { type: "Product", id: productId }],
    }),
    deleteTryOnImage: build.mutation({
      query: ({ productId }) => ({ url: `/admin/products/${productId}/tryon`, method: "DELETE" }),
      invalidatesTags: (result, error, { productId }) => ["Product", { type: "Product", id: productId }],
    }),
    deleteProductImage: build.mutation({
      query: ({ id }) => ({ url: `/admin/images/${id}`, method: "DELETE" }),
      invalidatesTags: (result, error, { productId }) => ["Product", { type: "Product", id: productId }],
    }),

    categories: build.query({
      query: () => "/admin/categories",
      providesTags: ["Category"],
    }),
    saveCategory: build.mutation({
      // FormData so an image can be included; Laravel needs POST + _method for updates with files.
      query: ({ id, formData }) => {
        if (id) formData.append("_method", "PUT");
        return { url: id ? `/admin/categories/${id}` : "/admin/categories", method: "POST", body: formData };
      },
      invalidatesTags: ["Category", "Product"],
    }),
    deleteCategory: build.mutation({
      query: (id) => ({ url: `/admin/categories/${id}`, method: "DELETE" }),
      invalidatesTags: ["Category"],
    }),

    inventory: build.query({
      query: (params) => ({ url: "/admin/inventory", params }),
      providesTags: ["Inventory"],
    }),
    movements: build.query({
      query: ({ variantId, page }) => ({ url: `/admin/inventory/${variantId}/movements`, params: { page } }),
      providesTags: ["Inventory"],
    }),
    adjustStock: build.mutation({
      query: (body) => ({ url: "/admin/inventory/adjust", method: "POST", body }),
      invalidatesTags: ["Inventory", "Product", "Dashboard"],
    }),
  }),
});

export const {
  useProductsQuery,
  useProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useUploadProductImagesMutation,
  useUpdateProductImageMutation,
  useDeleteProductImageMutation,
  useUploadTryOnImageMutation,
  useDeleteTryOnImageMutation,
  useCategoriesQuery,
  useSaveCategoryMutation,
  useDeleteCategoryMutation,
  useInventoryQuery,
  useMovementsQuery,
  useAdjustStockMutation,
} = catalogApi;
