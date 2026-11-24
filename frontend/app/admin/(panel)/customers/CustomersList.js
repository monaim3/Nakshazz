"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, Users } from "lucide-react";
import { useCustomersQuery } from "@/store/admin/contentApi";
import { useUrlFilters } from "@/components/admin/useUrlFilters";
import { ExportButton } from "@/components/admin/AdminShell";
import { formatBDT, formatDate } from "@/lib/format";
import { Card, cx, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Pagination, Table } from "@/components/admin/ui";

const FILTER_KEYS = ["q", "page"];

export default function CustomersList() {
  const router = useRouter();
  const [filters, setFilters] = useUrlFilters(FILTER_KEYS);
  const [search, setSearch] = useState(filters.q);
  const { data, error, isLoading, isFetching, refetch } = useCustomersQuery(filters);
  const customers = data?.data || [];

  useEffect(() => {
    if (search === filters.q) return undefined;
    const timer = setTimeout(() => setFilters({ q: search }), 350);
    return () => clearTimeout(timer);
  }, [search, filters.q, setFilters]);

  return (
    <>
      <PageHeader title="Customers" description="Everyone who ordered from the website or a manual sale, matched by phone number." actions={<ExportButton type="customers" />} />

      <Card padded={false}>
        <div className="border-b border-ink-100 p-4">
          <label className="relative block max-w-md">
            <span className="sr-only">Search customers</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-300" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, phone or email"
              className="h-10 w-full rounded-lg border-0 pr-3 pl-9 text-sm ring-1 ring-ink-200 ring-inset placeholder:text-ink-300 focus:ring-2 focus:ring-gold-500 focus:outline-none"
            />
          </label>
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
              rows={customers}
              onRowClick={(customer) => router.push(`/admin/customers/${customer.id}`)}
              empty={<EmptyState icon={Users} title="No customers found" description="Customers are added automatically when they order." />}
              columns={[
                {
                  key: "name",
                  label: "Customer",
                  render: (customer) => (
                    <div>
                      <p className="font-medium text-ink-900">{customer.name}</p>
                      <p className="text-xs text-ink-400">{customer.phone}</p>
                    </div>
                  ),
                },
                { key: "orders_count", label: "Orders", align: "right" },
                { key: "total_purchases", label: "Total bought", align: "right", render: (customer) => formatBDT(customer.total_purchases) },
                { key: "last_order_at", label: "Last order", className: "hidden sm:table-cell text-ink-500", render: (customer) => formatDate(customer.last_order_at) },
              ]}
            />
            <Pagination meta={data?.meta} onPageChange={(page) => setFilters({ page })} />
          </div>
        )}
      </Card>
    </>
  );
}
