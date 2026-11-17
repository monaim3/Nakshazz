"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Gem, Plus, Search, Star } from "lucide-react";
import { useCategoriesQuery, useProductsQuery } from "@/store/admin/catalogApi";
import { useUrlFilters } from "@/components/admin/useUrlFilters";
import { formatBDT } from "@/lib/format";
import { Button, Card, cx, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Pagination, Select, StatusBadge, Table } from "@/components/admin/ui";

const FILTER_KEYS = ["q", "status", "category_id", "page"];

function priceRange(variants = []) {
  const prices = variants.filter((variant) => variant.is_active).map((variant) => Number(variant.price));
  if (!prices.length) return "—";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatBDT(min) : `${formatBDT(min)} – ${formatBDT(max)}`;
}

function stockSummary(variants = []) {
  const active = variants.filter((variant) => variant.is_active);
  if (active.some((variant) => variant.allow_backorder)) return { label: "Made to order", tone: "text-violet-700" };
  const available = active.reduce((sum, variant) => sum + Math.max(0, variant.stock_available), 0);
  return { label: `${available} available`, tone: available === 0 ? "text-red-600" : available <= 3 ? "text-amber-600" : "text-ink-600" };
}

export default function ProductsList() {
  const router = useRouter();
  const [filters, setFilters] = useUrlFilters(FILTER_KEYS);
  const [search, setSearch] = useState(filters.q);
  const { data, error, isLoading, isFetching, refetch } = useProductsQuery(filters);
  const { data: categoryData } = useCategoriesQuery();
  const products = data?.data || [];
  const categories = (categoryData?.data || []).map((category) => ({ value: String(category.id), label: category.name }));

  useEffect(() => {
    if (search === filters.q) return undefined;
    const timer = setTimeout(() => setFilters({ q: search }), 350);
    return () => clearTimeout(timer);
  }, [search, filters.q, setFilters]);

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything in your catalogue, including drafts and archived items."
        actions={
          <Link href="/admin/products/new">
            <Button variant="gold">
              <Plus className="size-4" /> Add product
            </Button>
          </Link>
        }
      />

      <Card padded={false}>
        <div className="grid gap-3 border-b border-ink-100 p-4 sm:grid-cols-3">
          <label className="relative">
            <span className="sr-only">Search products</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-300" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or SKU"
              className="h-10 w-full rounded-lg border-0 pr-3 pl-9 text-sm ring-1 ring-ink-200 ring-inset placeholder:text-ink-300 focus:ring-2 focus:ring-gold-500 focus:outline-none"
            />
          </label>
          <Select
            aria-label="Status"
            placeholder="Any status"
            options={[
              { value: "active", label: "Active" },
              { value: "draft", label: "Draft" },
              { value: "archived", label: "Archived" },
            ]}
            value={filters.status}
            onChange={(event) => setFilters({ status: event.target.value })}
          />
          <Select aria-label="Category" placeholder="All categories" options={categories} value={filters.category_id} onChange={(event) => setFilters({ category_id: event.target.value })} />
        </div>

        {isLoading && <LoadingBlock />}
        {error && (
          <div className="p-4">
            <ErrorBlock error={error} onRetry={refetch} />
          </div>
        )}

        {!isLoading && !error && (
          <div className={cx("transition-opacity", isFetching && "opacity-60")}>
            <Table
              rows={products}
              onRowClick={(product) => router.push(`/admin/products/${product.id}`)}
              empty={
                <EmptyState
                  icon={Gem}
                  title="No products yet"
                  description="Add your first piece — photos, variants, prices and costs."
                  action={
                    <Link href="/admin/products/new">
                      <Button size="sm">Add product</Button>
                    </Link>
                  }
                />
              }
              columns={[
                {
                  key: "name",
                  label: "Product",
                  render: (product) => (
                    <div className="flex items-center gap-3">
                      <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-cream-200">
                        {product.primary_image && (
                          // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail from API host
                          <img src={product.primary_image.urls.sm} alt="" className="size-full object-cover" loading="lazy" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 font-medium text-ink-900">
                          {product.name}
                          {product.is_featured && <Star className="size-3.5 fill-gold-400 text-gold-400" aria-label="Featured" />}
                        </p>
                        <p className="text-xs text-ink-400">
                          {product.category?.name} · {product.variants?.length || 0} variant{product.variants?.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  ),
                },
                { key: "status", label: "Status", className: "hidden sm:table-cell", render: (product) => <StatusBadge status={product.status} /> },
                { key: "price", label: "Price", align: "right", render: (product) => priceRange(product.variants) },
                {
                  key: "stock",
                  label: "Stock",
                  align: "right",
                  className: "hidden md:table-cell",
                  render: (product) => {
                    const summary = stockSummary(product.variants);
                    return <span className={summary.tone}>{summary.label}</span>;
                  },
                },
              ]}
            />
            <Pagination meta={data?.meta} onPageChange={(page) => setFilters({ page })} />
          </div>
        )}
      </Card>
    </>
  );
}
