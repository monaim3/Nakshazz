"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { useReportChannelsQuery, useReportMonthlyQuery, useReportProductsQuery, useReportSummaryQuery } from "@/store/admin/ownerApi";
import { useUrlFilters } from "@/components/admin/useUrlFilters";
import { ExportButton } from "@/components/admin/AdminShell";
import MonthlyChart from "@/components/admin/MonthlyChart";
import { formatBDT, humanize, todayISO } from "@/lib/format";
import { SALES_CHANNELS } from "@/lib/admin-options";

const channelLabel = (value) => SALES_CHANNELS.find((option) => option.value === value)?.label || humanize(value);
import { Card, cx, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, StatCard, Table } from "@/components/admin/ui";

const FILTER_KEYS = ["range", "from", "to"];

/** Date presets in Dhaka time. */
function presetRange(key) {
  const today = todayISO();
  const [year, month] = today.split("-").map(Number);
  const pad = (number) => String(number).padStart(2, "0");
  const lastDay = (y, m) => new Date(y, m, 0).getDate();

  switch (key) {
    case "last_month": {
      const y = month === 1 ? year - 1 : year;
      const m = month === 1 ? 12 : month - 1;
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${lastDay(y, m)}` };
    }
    case "30_days":
      return { from: todayISO(-29), to: today };
    case "this_year":
      return { from: `${year}-01-01`, to: today };
    case "this_month":
    default:
      return { from: `${year}-${pad(month)}-01`, to: today };
  }
}

const PRESETS = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "30_days", label: "30 days" },
  { key: "this_year", label: "This year" },
  { key: "custom", label: "Custom" },
];

export default function Reports() {
  const [filters, setFilters] = useUrlFilters(FILTER_KEYS);
  const preset = filters.range || "this_month";
  const range = useMemo(() => (preset === "custom" && filters.from && filters.to ? { from: filters.from, to: filters.to } : presetRange(preset)), [preset, filters.from, filters.to]);
  const year = Number(todayISO().slice(0, 4));

  const summary = useReportSummaryQuery(range);
  const channels = useReportChannelsQuery(range);
  const products = useReportProductsQuery({ ...range, limit: 20 });
  const monthly = useReportMonthlyQuery({ from: `${year}-01-01`, to: todayISO() });

  return (
    <>
      <PageHeader title="Sales & profit" description="Profit counts only completed sales (delivered). Costs are taken from what each item cost when it was sold, so later price or cost changes never alter these numbers."
        actions={
          <>
            <ExportButton type="products" params={range} label="Export products" />
            <ExportButton type="payments" params={range} label="Export payments" />
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-white p-1 ring-1 ring-ink-100" role="group" aria-label="Date range">
          {PRESETS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={preset === item.key}
              onClick={() => setFilters(item.key === "custom" ? { range: "custom", ...range } : { range: item.key === "this_month" ? "" : item.key, from: "", to: "" })}
              className={cx("rounded-md px-3 py-1.5 text-sm", preset === item.key ? "bg-ink-900 text-cream-50" : "text-ink-600 hover:bg-cream-100")}
            >
              {item.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex gap-2">
            <Input aria-label="From" type="date" value={range.from} max={range.to} onChange={(event) => setFilters({ range: "custom", from: event.target.value, to: range.to })} />
            <Input aria-label="To" type="date" value={range.to} min={range.from} onChange={(event) => setFilters({ range: "custom", from: range.from, to: event.target.value })} />
          </div>
        )}
      </div>

      {summary.isLoading && <LoadingBlock />}
      {summary.error && <ErrorBlock error={summary.error} onRetry={summary.refetch} />}
      {summary.data && <Summary data={summary.data.data} fetching={summary.isFetching} />}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Sales by channel" padded={false}>
          <Channels query={channels} />
        </Card>
        <Card title={`Monthly · ${year}`} padded={false}>
          <div className="h-72 px-2 pt-4 pb-2">{monthly.data ? <MonthlyChart data={monthly.data.data} /> : <LoadingBlock />}</div>
        </Card>
      </div>

      <Card title="Profit by product" padded={false} className="mt-6">
        <Products query={products} />
      </Card>
    </>
  );
}

function Summary({ data, fetching }) {
  const { realized, estimated } = data;
  const net = Number(realized.net_profit);
  const margin = Number(realized.product_revenue) > 0 ? Math.round((Number(realized.gross_profit) / Number(realized.product_revenue)) * 100) : 0;

  const lines = [
    { label: "Product revenue", value: realized.product_revenue, hint: `After ${formatBDT(realized.discounts)} of discounts and any returns`, strong: true },
    { label: "Cost of products sold", value: -realized.cogs, hint: "Materials + labour + packaging at time of sale" },
    { label: "Gross profit", value: realized.gross_profit, strong: true, hint: `${margin}% margin` },
    { label: "Delivery result", value: realized.delivery_net, hint: `Charged ${formatBDT(realized.delivery_income)} · courier cost ${formatBDT(realized.delivery_cost)}` },
    { label: "Payment & COD fees", value: -realized.payment_fees },
    { label: "Goodwill refunds", value: -realized.compensation },
    { label: "Operating expenses", value: -realized.operating_expenses, hint: "From the Expenses page" },
  ];

  return (
    <div className={cx("grid gap-6 transition-opacity xl:grid-cols-5", fetching && "opacity-60")}>
      <Card title="Profit & loss (completed sales)" className="xl:col-span-3">
        <dl className="divide-y divide-ink-100">
          {lines.map((line) => (
            <div key={line.label} className="flex items-start justify-between gap-4 py-2.5">
              <dt className={cx("text-sm", line.strong ? "font-semibold text-ink-900" : "text-ink-600")}>
                {line.label}
                {line.hint && <span className="block text-xs font-normal text-ink-400">{line.hint}</span>}
              </dt>
              <dd className={cx("text-sm tabular-nums", line.strong ? "font-semibold text-ink-900" : Number(line.value) < 0 ? "text-ink-500" : "text-ink-700")}>
                {Number(line.value) < 0 ? `− ${formatBDT(Math.abs(line.value))}` : formatBDT(Number(line.value) || 0)}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 pt-3">
            <dt className="text-base font-semibold text-ink-900">Net profit</dt>
            <dd className={cx("text-xl font-semibold tabular-nums", net < 0 ? "text-red-600" : "text-emerald-700")}>{formatBDT(net)}</dd>
          </div>
        </dl>
      </Card>

      <div className="space-y-4 xl:col-span-2">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Completed orders" value={realized.orders} />
          <StatCard label="Net profit" value={formatBDT(net)} tone={net < 0 ? "bad" : "good"} />
        </div>
        <Card title="Estimated (not yet earned)">
          <p className="mb-3 flex gap-2 text-xs text-ink-500">
            <Info className="mt-0.5 size-3.5 shrink-0" /> Orders placed in this period that are still pending, confirmed, processing or shipped. They become real profit once delivered.
          </p>
          <dl className="space-y-1.5 text-sm">
            <Row label="Open orders" value={estimated.orders} />
            <Row label="Expected revenue" value={formatBDT(estimated.product_revenue)} />
            <Row label="Product cost" value={formatBDT(estimated.cogs)} />
            <Row label="Expected gross profit" value={formatBDT(estimated.gross_profit)} strong />
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Channels({ query }) {
  if (query.isLoading) return <LoadingBlock />;
  const rows = query.data?.data || [];
  const total = rows.reduce((sum, row) => sum + Number(row.product_revenue), 0);

  return (
    <Table
      rowKey="channel"
      rows={rows}
      empty={<EmptyState title="No completed sales in this period" />}
      columns={[
        {
          key: "channel",
          label: "Channel",
          render: (row) => (
            <div>
              <p className="font-medium text-ink-900">{channelLabel(row.channel)}</p>
              <div className="mt-1 h-1.5 w-24 rounded-full bg-cream-200">
                <div className="h-full rounded-full bg-gold-500" style={{ width: `${total ? (Number(row.product_revenue) / total) * 100 : 0}%` }} />
              </div>
            </div>
          ),
        },
        { key: "orders", label: "Orders", align: "right" },
        { key: "product_revenue", label: "Revenue", align: "right", render: (row) => formatBDT(row.product_revenue) },
        { key: "gross_profit", label: "Gross profit", align: "right", render: (row) => formatBDT(row.gross_profit) },
      ]}
    />
  );
}

function Products({ query }) {
  if (query.isLoading) return <LoadingBlock />;

  return (
    <Table
      rowKey="product_name"
      rows={query.data?.data || []}
      empty={<EmptyState title="No completed sales in this period" />}
      columns={[
        { key: "product_name", label: "Product", render: (row) => <span className="font-medium text-ink-900">{row.product_name}</span> },
        { key: "units_sold", label: "Sold", align: "right" },
        { key: "product_revenue", label: "Revenue", align: "right", className: "hidden sm:table-cell", render: (row) => formatBDT(row.product_revenue) },
        { key: "cogs", label: "Cost", align: "right", className: "hidden md:table-cell", render: (row) => formatBDT(row.cogs) },
        { key: "gross_profit", label: "Profit", align: "right", render: (row) => <span className={Number(row.gross_profit) < 0 ? "text-red-600" : "text-ink-900"}>{formatBDT(row.gross_profit)}</span> },
        { key: "margin_percent", label: "Margin", align: "right", render: (row) => `${Math.round(Number(row.margin_percent))}%` },
      ]}
    />
  );
}

function Row({ label, value, strong }) {
  return (
    <div className={cx("flex justify-between", strong ? "border-t border-ink-100 pt-1.5 font-semibold text-ink-900" : "text-ink-600")}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
