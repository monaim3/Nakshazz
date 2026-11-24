"use client";

import { useEffect, useState } from "react";
import { ChevronDown, History, Lock, Search } from "lucide-react";
import { useActivityQuery } from "@/store/admin/opsApi";
import { useUrlFilters } from "@/components/admin/useUrlFilters";
import { useIsOwner } from "@/components/admin/AdminShell";
import { formatDateTime, humanize, todayISO } from "@/lib/format";
import { Badge, Button, Card, cx, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, Pagination, Select } from "@/components/admin/ui";

const FILTER_KEYS = ["q", "subject_type", "from", "to", "page"];

const TYPES = [
  { value: "order", label: "Orders" },
  { value: "payment", label: "Payments" },
  { value: "product", label: "Products" },
  { value: "variant", label: "Variants / stock" },
  { value: "coupon", label: "Coupons" },
  { value: "expense", label: "Expenses" },
  { value: "delivery_zone", label: "Delivery zones" },
  { value: "user", label: "Staff accounts" },
  { value: "settings", label: "Settings" },
  { value: "cash_closing", label: "Daily closing" },
  { value: "export", label: "Exports" },
];

const TYPE_TONES = { order: "blue", payment: "green", product: "gold", variant: "gold", expense: "violet", user: "red", settings: "neutral", cash_closing: "green", export: "neutral" };

export default function ActivityLog() {
  const isOwner = useIsOwner();
  const [filters, setFilters] = useUrlFilters(FILTER_KEYS);
  const [search, setSearch] = useState(filters.q);
  const { data, error, isLoading, isFetching, refetch } = useActivityQuery({ ...filters, per_page: 30 }, { skip: !isOwner });
  const entries = data?.data || [];

  useEffect(() => {
    if (search === filters.q) return undefined;
    const timer = setTimeout(() => setFilters({ q: search }), 350);
    return () => clearTimeout(timer);
  }, [search, filters.q, setFilters]);

  if (!isOwner) {
    return <EmptyState icon={Lock} title="Owner only" description="Only the shop owner can see the activity log." />;
  }

  const hasFilters = FILTER_KEYS.some((key) => key !== "page" && filters[key]);

  return (
    <>
      <PageHeader title="Activity log" description="Who changed what and when: orders, payments, prices, stock, settings and staff accounts." />

      <Card padded={false}>
        <div className="grid gap-3 border-b border-ink-100 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
          <label className="relative sm:col-span-2 lg:col-span-1">
            <span className="sr-only">Search activity</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-300" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search, e.g. order number or product"
              className="h-10 w-full rounded-lg border-0 bg-white pr-3 pl-9 text-sm ring-1 ring-ink-200 ring-inset placeholder:text-ink-300 focus:ring-2 focus:ring-gold-500 focus:outline-none"
            />
          </label>
          <Select aria-label="Type" placeholder="All types" options={TYPES} value={filters.subject_type} onChange={(event) => setFilters({ subject_type: event.target.value })} />
          <Input aria-label="From" type="date" value={filters.from} max={filters.to || todayISO()} onChange={(event) => setFilters({ from: event.target.value })} />
          <Input aria-label="To" type="date" value={filters.to} min={filters.from || undefined} max={todayISO()} onChange={(event) => setFilters({ to: event.target.value })} />
          <Button
            variant="ghost"
            disabled={!hasFilters}
            onClick={() => {
              setSearch("");
              setFilters({ q: "", subject_type: "", from: "", to: "" });
            }}
          >
            Clear
          </Button>
        </div>

        {isLoading && <LoadingBlock />}
        {error && (
          <div className="p-4">
            <ErrorBlock error={error} onRetry={refetch} />
          </div>
        )}

        {!isLoading && !error && (
          <div className={cx("transition-opacity", isFetching && "opacity-60")}>
            {entries.length === 0 ? (
              <EmptyState icon={History} title="No activity found" description={hasFilters ? "Try different filters." : "Changes made in the admin panel will appear here."} />
            ) : (
              <ul className="divide-y divide-ink-100">
                {entries.map((entry) => (
                  <ActivityEntry key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
            <Pagination meta={data?.meta} onPageChange={(page) => setFilters({ page })} />
          </div>
        )}
      </Card>
    </>
  );
}

function ActivityEntry({ entry }) {
  const [open, setOpen] = useState(false);
  const changes = entry.changes && typeof entry.changes === "object" ? Object.entries(entry.changes) : [];
  const typeLabel = TYPES.find((type) => type.value === entry.subject_type)?.label || humanize(entry.subject_type);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <time dateTime={entry.created_at} className="shrink-0 text-xs whitespace-nowrap text-ink-400 sm:w-36 sm:pt-0.5">
          {formatDateTime(entry.created_at)}
        </time>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-900">{entry.summary || humanize(entry.action)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            {entry.subject_type && <Badge tone={TYPE_TONES[entry.subject_type] || "neutral"}>{typeLabel}</Badge>}
            <span>
              {entry.user ? (
                <>
                  {entry.user.name} <span className="text-ink-400 capitalize">({entry.user.role})</span>
                </>
              ) : (
                <span className="text-ink-400">System / customer</span>
              )}
            </span>
            {entry.ip_address && <span className="text-ink-300">· {entry.ip_address}</span>}
          </p>
        </div>
        {changes.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="inline-flex shrink-0 items-center gap-1 self-start rounded-md px-2 py-1 text-xs font-medium text-gold-700 hover:bg-cream-100"
          >
            {changes.length} change{changes.length === 1 ? "" : "s"}
            <ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        )}
      </div>

      {open && changes.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg ring-1 ring-ink-100 sm:ml-40">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-ink-100 bg-cream-50 text-ink-500 uppercase">
                <th scope="col" className="px-3 py-2 font-medium">Field</th>
                <th scope="col" className="px-3 py-2 font-medium">From</th>
                <th scope="col" className="px-3 py-2 font-medium">To</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {changes.map(([field, change]) => (
                <tr key={field}>
                  <td className="px-3 py-2 font-medium text-ink-700">{humanize(field)}</td>
                  <td className="px-3 py-2 break-all text-red-700">{formatValue(change?.from)}</td>
                  <td className="px-3 py-2 break-all text-emerald-700">{formatValue(change?.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return <span className="text-ink-300">empty</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
