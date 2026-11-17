"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Boxes, History, Search, SlidersHorizontal } from "lucide-react";
import { useAdjustStockMutation, useInventoryQuery, useMovementsQuery } from "@/store/admin/catalogApi";
import { useUrlFilters } from "@/components/admin/useUrlFilters";
import { formatDateTime, humanize } from "@/lib/format";
import { Button, Card, Checkbox, cx, EmptyState, ErrorBlock, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, Table, useToast } from "@/components/admin/ui";

const FILTER_KEYS = ["q", "low_stock", "page"];

const MOVEMENT_LABELS = {
  purchase: "New stock",
  adjustment_in: "Added (correction)",
  adjustment_out: "Removed",
  reserve: "Reserved for order",
  release: "Released (cancelled)",
  sale: "Sold",
  return: "Returned to stock",
  return_damaged: "Returned damaged",
};

export default function InventoryList() {
  const [filters, setFilters] = useUrlFilters(FILTER_KEYS);
  const [search, setSearch] = useState(filters.q);
  const { data, error, isLoading, isFetching, refetch } = useInventoryQuery(filters);
  const [adjusting, setAdjusting] = useState(null);
  const [history, setHistory] = useState(null);
  const variants = data?.data || [];

  useEffect(() => {
    if (search === filters.q) return undefined;
    const timer = setTimeout(() => setFilters({ q: search }), 350);
    return () => clearTimeout(timer);
  }, [search, filters.q, setFilters]);

  return (
    <>
      <PageHeader title="Inventory" description="Stock on hand, reserved for open orders, and available to sell. Every change is logged." />

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search stock</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-300" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Product name or SKU"
              className="h-10 w-full rounded-lg border-0 pr-3 pl-9 text-sm ring-1 ring-ink-200 ring-inset placeholder:text-ink-300 focus:ring-2 focus:ring-gold-500 focus:outline-none"
            />
          </label>
          <Checkbox label="Low stock only" checked={filters.low_stock === "1"} onChange={(event) => setFilters({ low_stock: event.target.checked ? "1" : "" })} />
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
              rows={variants}
              empty={<EmptyState icon={Boxes} title="Nothing here" description={filters.low_stock ? "No products are low on stock." : "Add products to start tracking stock."} />}
              columns={[
                {
                  key: "product",
                  label: "Product",
                  render: (variant) => (
                    <Link href={`/admin/products/${variant.product?.id}`} className="block hover:underline">
                      <span className="font-medium text-ink-900">{variant.product?.name}</span>
                      <span className="block text-xs text-ink-400">
                        {variant.title !== "Default" && `${variant.title} · `}
                        {variant.sku}
                      </span>
                    </Link>
                  ),
                },
                { key: "stock_on_hand", label: "On hand", align: "right", className: "hidden sm:table-cell" },
                { key: "stock_reserved", label: "Reserved", align: "right", className: "hidden sm:table-cell text-ink-400" },
                {
                  key: "stock_available",
                  label: "Available",
                  align: "right",
                  render: (variant) =>
                    variant.allow_backorder ? (
                      <span className="text-xs text-violet-700">Made to order</span>
                    ) : (
                      <span className={cx("font-semibold", variant.stock_available <= 0 ? "text-red-600" : variant.stock_available <= (variant.low_stock_threshold ?? 3) ? "text-amber-600" : "text-ink-900")}>
                        {variant.stock_available}
                      </span>
                    ),
                },
                {
                  key: "actions",
                  label: "",
                  align: "right",
                  render: (variant) => (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setAdjusting(variant)}>
                        <SlidersHorizontal className="size-3.5" /> <span className="hidden sm:inline">Adjust</span>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setHistory(variant)} aria-label="Stock history">
                        <History className="size-4" />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
            <Pagination meta={data?.meta} onPageChange={(page) => setFilters({ page })} />
          </div>
        )}
      </Card>

      {adjusting && <AdjustModal key={adjusting.id} variant={adjusting} onClose={() => setAdjusting(null)} />}
      {history && <HistoryModal variant={history} onClose={() => setHistory(null)} />}
    </>
  );
}

function AdjustModal({ variant, onClose }) {
  const [adjust, { isLoading }] = useAdjustStockMutation();
  const { notify } = useToast();
  const [form, setForm] = useState({ type: "purchase", quantity: "", reason: "" });
  const [errors, setErrors] = useState({});
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const quantity = Number(form.quantity || 0);
  const after = form.type === "adjustment_out" ? variant.stock_on_hand - quantity : variant.stock_on_hand + quantity;

  async function submit() {
    setErrors({});
    try {
      await adjust({ variant_id: variant.id, type: form.type, quantity, reason: form.reason }).unwrap();
      notify("Stock updated.");
      onClose();
    } catch (error) {
      const fieldErrors = Object.fromEntries(Object.entries(error.errors || {}).map(([key, messages]) => [key, messages[0]]));
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: error.message });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Adjust stock · ${variant.product?.name}${variant.title !== "Default" ? ` (${variant.title})` : ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isLoading} onClick={submit} disabled={!quantity || !form.reason.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="What happened?"
          options={[
            { value: "purchase", label: "New stock made / bought (+)" },
            { value: "adjustment_in", label: "Count correction — found more (+)" },
            { value: "adjustment_out", label: "Damaged, lost or used (−)" },
          ]}
          value={form.type}
          onChange={set("type")}
        />
        <Input label="Quantity" type="number" min="1" inputMode="numeric" value={form.quantity} onChange={set("quantity")} error={errors.quantity} autoFocus />
        <Input label="Reason" placeholder="e.g. New batch from karigar" value={form.reason} onChange={set("reason")} error={errors.reason} />
        <p className="rounded-lg bg-cream-100 px-3 py-2 text-sm text-ink-600">
          On hand: <strong>{variant.stock_on_hand}</strong> → <strong className={after < 0 ? "text-red-600" : "text-ink-900"}>{after}</strong>
          {variant.stock_reserved > 0 && <span className="text-ink-400"> · {variant.stock_reserved} reserved for open orders</span>}
        </p>
        {errors.form && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}
      </div>
    </Modal>
  );
}

function HistoryModal({ variant, onClose }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMovementsQuery({ variantId: variant.id, page });
  const movements = data?.data || [];

  return (
    <Modal open onClose={onClose} size="lg" title={`Stock history · ${variant.product?.name}${variant.title !== "Default" ? ` (${variant.title})` : ""}`}>
      {isLoading ? (
        <LoadingBlock />
      ) : movements.length === 0 ? (
        <EmptyState icon={History} title="No stock changes yet" />
      ) : (
        <>
          <ul className="divide-y divide-ink-100">
            {movements.map((movement) => (
              <li key={movement.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink-900">{MOVEMENT_LABELS[movement.type] || humanize(movement.type)}</p>
                  <p className="text-xs text-ink-400">
                    {formatDateTime(movement.created_at)}
                    {movement.user && ` · ${movement.user.name}`}
                    {movement.order && (
                      <>
                        {" · "}
                        <Link href={`/admin/orders/${movement.order.id}`} className="text-gold-700 hover:underline">
                          {movement.order.order_number}
                        </Link>
                      </>
                    )}
                  </p>
                  {movement.reason && <p className="text-xs text-ink-500">{movement.reason}</p>}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  {movement.on_hand_delta !== 0 && (
                    <p className={movement.on_hand_delta > 0 ? "text-emerald-700" : "text-red-600"}>
                      {movement.on_hand_delta > 0 ? "+" : ""}
                      {movement.on_hand_delta} on hand
                    </p>
                  )}
                  {movement.reserved_delta !== 0 && (
                    <p className="text-xs text-ink-400">
                      {movement.reserved_delta > 0 ? "+" : ""}
                      {movement.reserved_delta} reserved
                    </p>
                  )}
                  <p className="text-xs text-ink-400">→ {movement.on_hand_after}</p>
                </div>
              </li>
            ))}
          </ul>
          <Pagination meta={data?.meta} onPageChange={setPage} />
        </>
      )}
    </Modal>
  );
}
