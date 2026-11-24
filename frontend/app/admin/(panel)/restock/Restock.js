"use client";

import Link from "next/link";
import { Boxes, Lock, PackageCheck } from "lucide-react";
import { useRestockQuery } from "@/store/admin/opsApi";
import { ExportButton, useIsOwner } from "@/components/admin/AdminShell";
import { formatBDT, formatNumber } from "@/lib/format";
import { Badge, Card, cx, EmptyState, ErrorBlock, LoadingBlock, PageHeader, StatCard, Table } from "@/components/admin/ui";

const URGENCY = {
  out: { tone: "red", label: "Out of stock" },
  soon: { tone: "amber", label: "Runs out soon" },
  low: { tone: "gold", label: "Low stock" },
  plan: { tone: "blue", label: "Plan ahead" },
};

export default function Restock() {
  const isOwner = useIsOwner();
  const { data, error, isLoading, isFetching, refetch } = useRestockQuery(undefined, { skip: !isOwner });
  const restock = data?.data;

  if (!isOwner) {
    return <EmptyState icon={Lock} title="Owner only" description="Only the shop owner can see restock suggestions." />;
  }

  return (
    <>
      <PageHeader
        title="Restock"
        description="What to make or buy next, based on the last 30 days of sales. Suggested quantity covers the number of days set in Settings (reorder cover days)."
        actions={<ExportButton type="restock" />}
      />

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} onRetry={refetch} />}

      {restock && (
        <div className={cx("space-y-6 transition-opacity", isFetching && "opacity-60")}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Stock value at cost" value={formatBDT(restock.stock_value.at_cost)} tone="gold" hint="What the stock on hand cost to make" />
            <StatCard label="Stock value at price" value={formatBDT(restock.stock_value.at_price)} hint="If everything sold at list price" />
            <StatCard label="Units in stock" value={formatNumber(restock.stock_value.units)} hint={`${formatNumber(restock.stock_value.variants)} variants`} icon={Boxes} />
            <StatCard label="Need attention" value={restock.items.filter((item) => item.urgency === "out" || item.urgency === "soon").length} hint="Out of stock or running out soon" tone={restock.items.some((item) => item.urgency === "out") ? "bad" : "default"} />
          </div>

          <Card title="Suggestions" padded={false}>
            <Table
              rowKey="variant_id"
              rows={restock.items}
              empty={<EmptyState icon={PackageCheck} title="Nothing to restock" description="Every product has enough stock for the coming days." />}
              columns={[
                {
                  key: "product",
                  label: "Product",
                  render: (item) => (
                    <Link href={item.product_id ? `/admin/products/${item.product_id}` : `/admin/products?q=${encodeURIComponent(item.product || item.sku || "")}`} className="block hover:underline">
                      <span className="font-medium text-ink-900">{item.product}</span>
                      <span className="block text-xs text-ink-400">
                        {item.title && item.title !== "Default" && `${item.title} · `}
                        {item.sku}
                      </span>
                    </Link>
                  ),
                },
                { key: "urgency", label: "Urgency", render: (item) => <Badge tone={URGENCY[item.urgency]?.tone || "neutral"}>{URGENCY[item.urgency]?.label || item.urgency}</Badge> },
                {
                  key: "available",
                  label: "Available",
                  align: "right",
                  render: (item) => <span className={cx("font-semibold", item.available <= 0 ? "text-red-600" : item.is_low ? "text-amber-600" : "text-ink-900")}>{item.available}</span>,
                },
                { key: "sold_last_days", label: "Sold (30 days)", align: "right", className: "hidden sm:table-cell" },
                { key: "per_day", label: "Per day", align: "right", className: "hidden md:table-cell text-ink-500", render: (item) => Number(item.per_day).toFixed(2) },
                {
                  key: "days_left",
                  label: "Days left",
                  align: "right",
                  className: "hidden sm:table-cell",
                  render: (item) => (item.days_left === null || item.days_left === undefined ? <span className="text-ink-300">—</span> : item.days_left),
                },
                { key: "suggested_quantity", label: "Make / buy", align: "right", render: (item) => <span className="font-semibold text-gold-700">{item.suggested_quantity}</span> },
              ]}
            />
          </Card>
        </div>
      )}
    </>
  );
}
