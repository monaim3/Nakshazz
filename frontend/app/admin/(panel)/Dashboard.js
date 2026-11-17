"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowRight, Banknote, ClipboardPlus, PackageCheck, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { useDashboardQuery } from "@/store/admin/api";
import { formatBDT, formatDateTime, todayISO } from "@/lib/format";
import { Badge, Button, Card, cx, EmptyState, ErrorBlock, LoadingBlock, PageHeader, StatCard, StatusBadge, Table } from "@/components/admin/ui";
import SalesChart from "@/components/admin/SalesChart";

const RANGES = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
];

export default function Dashboard() {
  const [range, setRange] = useState("30");
  const days = RANGES.find((item) => item.key === range).days;
  const { data, error, isLoading, isFetching, refetch } = useDashboardQuery({ from: todayISO(-(days - 1)), to: todayISO() });
  const dashboard = data?.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Completed sales and profit for the selected period. Pending orders are counted separately as estimates."
        actions={
          <>
            <div className="inline-flex rounded-lg bg-white p-1 ring-1 ring-ink-200" role="group" aria-label="Date range">
              {RANGES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRange(item.key)}
                  aria-pressed={range === item.key}
                  className={cx("rounded-md px-3 py-1.5 text-xs font-medium", range === item.key ? "bg-ink-900 text-cream-50" : "text-ink-600 hover:bg-cream-100")}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Link href="/admin/sales/new">
              <Button variant="gold">
                <ClipboardPlus className="size-4" /> New sale
              </Button>
            </Link>
          </>
        }
      />

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} onRetry={refetch} />}

      {dashboard && (
        <div className={cx("space-y-6 transition-opacity", isFetching && "opacity-60")}>
          <Attention attention={dashboard.attention} />

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Revenue" value={formatBDT(dashboard.cards.total_revenue)} hint="Completed, after discounts" icon={Banknote} />
            <StatCard label="Orders" value={dashboard.cards.total_orders} hint={`${dashboard.cards.completed_orders} completed`} icon={ShoppingBag} />
            <StatCard label="Website sales" value={formatBDT(dashboard.cards.website_sales)} icon={TrendingUp} />
            <StatCard label="Manual sales" value={formatBDT(dashboard.cards.manual_sales)} hint="Facebook, WhatsApp, store…" icon={ClipboardPlus} />
            {"net_profit" in dashboard.cards && (
              <>
                <StatCard label="Gross profit" value={formatBDT(dashboard.cards.gross_profit)} tone="gold" hint="Revenue − product cost" />
                <StatCard label="Net profit" value={formatBDT(dashboard.cards.net_profit)} tone={Number(dashboard.cards.net_profit) < 0 ? "bad" : "good"} hint="After delivery, fees & expenses" />
                <StatCard label="Estimated profit" value={formatBDT(dashboard.cards.estimated_gross_profit)} hint="Open orders, not yet earned" />
              </>
            )}
          </div>

          <Card title="Sales overview" padded={false}>
            <div className="h-64 px-2 pt-4 pb-2 sm:h-72">
              <SalesChart data={dashboard.sales_chart} />
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-5">
            <Card
              className="xl:col-span-3"
              title="Recent orders"
              padded={false}
              actions={
                <Link href="/admin/orders" className="inline-flex items-center gap-1 text-xs font-medium text-gold-700 hover:underline">
                  All orders <ArrowRight className="size-3" />
                </Link>
              }
            >
              <RecentOrders orders={dashboard.recent_orders} />
            </Card>

            <Card
              className="xl:col-span-2"
              title="Low stock"
              padded={false}
              actions={
                <Link href="/admin/inventory?low_stock=1" className="inline-flex items-center gap-1 text-xs font-medium text-gold-700 hover:underline">
                  Inventory <ArrowRight className="size-3" />
                </Link>
              }
            >
              <LowStock variants={dashboard.low_stock} />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Attention({ attention }) {
  const items = [
    { count: attention.unconfirmed_over_24h, label: "orders waiting over 24h to be confirmed", href: "/admin/orders?status=pending", tone: "red", icon: AlertTriangle },
    { count: attention.bkash_to_verify, label: "bKash payments to verify", href: "/admin/payments", tone: "amber", icon: Wallet },
    { count: attention.pending_orders, label: "new orders to confirm", href: "/admin/orders?status=pending", tone: "amber", icon: ShoppingBag },
    { count: attention.ready_to_ship, label: "orders ready to ship", href: "/admin/orders?status=confirmed", tone: "blue", icon: PackageCheck },
  ].filter((item) => item.count > 0);

  if (items.length === 0) return null;

  const tones = { red: "bg-red-50 text-red-800 ring-red-200", amber: "bg-amber-50 text-amber-900 ring-amber-200", blue: "bg-sky-50 text-sky-900 ring-sky-200" };

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Link key={item.label} href={item.href} className={cx("flex items-center gap-3 rounded-xl px-4 py-3 text-sm ring-1 transition-shadow hover:shadow-sm", tones[item.tone])}>
          <item.icon className="size-5 shrink-0" aria-hidden />
          <span>
            <strong className="text-base tabular-nums">{item.count}</strong> {item.label}
          </span>
        </Link>
      ))}
    </div>
  );
}

function RecentOrders({ orders }) {
  return (
    <Table
      rows={orders}
      empty={<EmptyState icon={ShoppingBag} title="No orders yet" description="Website orders and manual sales will appear here." />}
      columns={[
        {
          key: "order_number",
          label: "Order",
          render: (order) => (
            <Link href={`/admin/orders/${order.id}`} className="font-medium text-ink-900 hover:underline">
              {order.order_number}
            </Link>
          ),
        },
        { key: "customer", label: "Customer", className: "hidden sm:table-cell", render: (order) => order.customer_name || <span className="text-ink-300">Walk-in</span> },
        { key: "channel", label: "Channel", className: "hidden md:table-cell", render: (order) => <Badge>{order.channel_label}</Badge> },
        { key: "status", label: "Status", render: (order) => <StatusBadge status={order.status} /> },
        { key: "grand_total", label: "Total", align: "right", render: (order) => formatBDT(order.grand_total) },
        { key: "placed_at", label: "Placed", className: "hidden lg:table-cell text-ink-500", render: (order) => formatDateTime(order.placed_at) },
      ]}
    />
  );
}

function LowStock({ variants }) {
  return (
    <Table
      rows={variants}
      empty={<EmptyState icon={PackageCheck} title="Stock looks healthy" description="Nothing is below its low-stock level." />}
      columns={[
        {
          key: "product",
          label: "Product",
          render: (variant) => (
            <Link href={`/admin/products/${variant.product?.id}`} className="block hover:underline">
              <span className="font-medium text-ink-900">{variant.product?.name}</span>
              {variant.title !== "Default" && <span className="block text-xs text-ink-400">{variant.title}</span>}
            </Link>
          ),
        },
        {
          key: "stock_available",
          label: "Available",
          align: "right",
          render: (variant) => <span className={cx("font-semibold", variant.stock_available <= 0 ? "text-red-600" : "text-amber-600")}>{variant.stock_available}</span>,
        },
      ]}
    />
  );
}
