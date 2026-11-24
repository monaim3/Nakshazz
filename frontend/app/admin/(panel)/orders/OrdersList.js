"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ClipboardPlus, Search, ShoppingBag } from "lucide-react";
import { useOrdersQuery } from "@/store/admin/ordersApi";
import { useUrlFilters } from "@/components/admin/useUrlFilters";
import { ExportButton } from "@/components/admin/AdminShell";
import { ORDER_STATUSES, PAYMENT_STATUSES, SALES_CHANNELS } from "@/lib/admin-options";
import { formatBDT, formatDateTime } from "@/lib/format";
import { Badge, Button, Card, cx, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Pagination, Select, StatusBadge, Table } from "@/components/admin/ui";

const FILTER_KEYS = ["q", "status", "payment_status", "channel", "page"];

export default function OrdersList() {
  const router = useRouter();
  const [filters, setFilters] = useUrlFilters(FILTER_KEYS);
  const [search, setSearch] = useState(filters.q);
  const { data, error, isLoading, isFetching, refetch } = useOrdersQuery(filters);

  // Debounce typing into the search box before it hits the URL / API.
  useEffect(() => {
    if (search === filters.q) return undefined;
    const timer = setTimeout(() => setFilters({ q: search }), 350);
    return () => clearTimeout(timer);
  }, [search, filters.q, setFilters]);

  const orders = data?.data || [];
  const statusTabs = [{ value: "", label: "All" }, ...ORDER_STATUSES.slice(0, 5)];

  return (
    <>
      <PageHeader
        title="Orders"
        description="Website orders and manual sales in one place."
        actions={
          <>
            <ExportButton type="orders" params={{ status: filters.status, from: filters.from, to: filters.to }} />
            <Link href="/admin/sales/new">
              <Button variant="gold">
                <ClipboardPlus className="size-4" /> New sale
              </Button>
            </Link>
          </>
        }
      />

      <div className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex gap-1 rounded-lg bg-white p-1 ring-1 ring-ink-100" role="tablist" aria-label="Order status">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={filters.status === tab.value}
              onClick={() => setFilters({ status: tab.value })}
              className={cx("rounded-md px-3 py-1.5 text-sm whitespace-nowrap", filters.status === tab.value ? "bg-ink-900 text-cream-50" : "text-ink-600 hover:bg-cream-100")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Card padded={false}>
        <div className="grid gap-3 border-b border-ink-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative sm:col-span-2 lg:col-span-1">
            <span className="sr-only">Search orders</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-300" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Order no, phone or name"
              className="h-10 w-full rounded-lg border-0 bg-white pr-3 pl-9 text-sm ring-1 ring-ink-200 ring-inset placeholder:text-ink-300 focus:ring-2 focus:ring-gold-500 focus:outline-none"
            />
          </label>
          <Select aria-label="Status" placeholder="Any status" options={ORDER_STATUSES} value={filters.status} onChange={(event) => setFilters({ status: event.target.value })} />
          <Select aria-label="Payment" placeholder="Any payment" options={PAYMENT_STATUSES} value={filters.payment_status} onChange={(event) => setFilters({ payment_status: event.target.value })} />
          <Select aria-label="Channel" placeholder="Any channel" options={SALES_CHANNELS} value={filters.channel} onChange={(event) => setFilters({ channel: event.target.value })} />
        </div>

        {isLoading && <LoadingBlock />}
        {error && (
          <div className="p-4">
            <ErrorBlock error={error} onRetry={refetch} />
          </div>
        )}

        {!isLoading && !error && (
          <div className={cx("transition-opacity", isFetching && "opacity-60")}>
            {/* Phone: cards */}
            <ul className="divide-y divide-ink-100 md:hidden">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link href={`/admin/orders/${order.id}`} className="flex items-start justify-between gap-3 px-4 py-3 active:bg-cream-100">
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">{order.order_number}</p>
                      <p className="truncate text-sm text-ink-500">{order.customer_name || "Walk-in"} · {order.channel_label}</p>
                      <p className="mt-1 text-xs text-ink-400">{formatDateTime(order.placed_at)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold tabular-nums">{formatBDT(order.grand_total)}</span>
                      <StatusBadge status={order.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table
                rows={orders}
                onRowClick={(order) => router.push(`/admin/orders/${order.id}`)}
                columns={[
                  { key: "order_number", label: "Order", render: (order) => <span className="font-medium text-ink-900">{order.order_number}</span> },
                  {
                    key: "customer",
                    label: "Customer",
                    render: (order) => (
                      <div>
                        <p className="text-ink-800">{order.customer_name || <span className="text-ink-300">Walk-in</span>}</p>
                        {order.customer_phone && <p className="text-xs text-ink-400">{order.customer_phone}</p>}
                      </div>
                    ),
                  },
                  { key: "channel", label: "Channel", render: (order) => <Badge>{order.channel_label}</Badge> },
                  { key: "status", label: "Status", render: (order) => <StatusBadge status={order.status} /> },
                  { key: "payment_status", label: "Payment", render: (order) => <StatusBadge status={order.payment_status} /> },
                  { key: "items_count", label: "Items", align: "right" },
                  { key: "grand_total", label: "Total", align: "right", render: (order) => <span className="font-medium">{formatBDT(order.grand_total)}</span> },
                  { key: "placed_at", label: "Placed", className: "text-ink-500 whitespace-nowrap", render: (order) => formatDateTime(order.placed_at) },
                ]}
              />
            </div>

            {orders.length === 0 && (
              <EmptyState icon={ShoppingBag} title="No orders match" description="Try a different search or clear the filters." />
            )}

            <Pagination meta={data?.meta} onPageChange={(page) => setFilters({ page })} />
          </div>
        )}
      </Card>
    </>
  );
}
