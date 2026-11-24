"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarCheck, Check, Hourglass, Lock } from "lucide-react";
import { useClosingQuery, useSaveClosingMutation } from "@/store/admin/opsApi";
import { useUrlFilters } from "@/components/admin/useUrlFilters";
import { ExportButton, useIsOwner } from "@/components/admin/AdminShell";
import { formatBDT, formatDate, formatDateTime, humanize, todayISO } from "@/lib/format";
import { Badge, Button, Card, cx, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, StatCard, StatusBadge, Table, useToast } from "@/components/admin/ui";

const FILTER_KEYS = ["date"];

const money = (value) => formatBDT(value, { exact: true });
const METHOD_LABELS = { cod: "COD", bkash: "bKash", cash: "Cash" };
const methodLabel = (value) => (value ? METHOD_LABELS[value] || humanize(value) : null);

export default function DailyClosing() {
  const isOwner = useIsOwner();
  const [filters, setFilters] = useUrlFilters(FILTER_KEYS);
  const today = todayISO();
  const date = filters.date && filters.date <= today ? filters.date : today;
  const { data, error, isLoading, isFetching, refetch } = useClosingQuery(date, { skip: !isOwner });
  const closing = data?.data;

  if (!isOwner) {
    return <EmptyState icon={Lock} title="Owner only" description="Only the shop owner can see the daily closing." />;
  }

  return (
    <>
      <PageHeader
        title="Daily closing"
        description="At the end of the day, count the money in each account and compare it with what the system expects. Expected = received − fees − refunds for that day."
        actions={
          <>
            <Input aria-label="Day" type="date" value={date} max={today} onChange={(event) => setFilters({ date: event.target.value && event.target.value !== today ? event.target.value : "" })} />
            <ExportButton type="payments" params={{ from: date, to: date }} label="Export payments" />
          </>
        }
      />

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} onRetry={refetch} />}

      {closing && (
        <div className={cx("space-y-6 transition-opacity", isFetching && "opacity-60")}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Received" value={money(closing.totals.received)} hint={formatDate(closing.date)} />
            <StatCard label="Refunded" value={money(closing.totals.refunded)} />
            <StatCard label="Expected in hand" value={money(closing.totals.expected)} tone="gold" hint="After fees and refunds" />
            <StatCard label="Still to come in" value={money(closing.receivables.total)} hint={`${closing.receivables.count} order${closing.receivables.count === 1 ? "" : "s"}`} icon={Hourglass} />
          </div>

          <Card title={`Money by payment method · ${formatDate(closing.date)}`} padded={false}>
            <MethodsTable closing={closing} />
          </Card>

          <Card title="Money still to come in" padded={false} actions={<span className="text-sm font-semibold text-ink-900 tabular-nums">{money(closing.receivables.total)}</span>}>
            <p className="border-b border-ink-100 px-5 py-3 text-xs text-ink-500">
              Orders that are not fully paid yet, for example cash on delivery still with the courier. Orders out for more than 7 days are highlighted — follow up with the courier.
            </p>
            <Receivables orders={closing.receivables.orders} />
          </Card>
        </div>
      )}
    </>
  );
}

function MethodsTable({ closing }) {
  if (!closing.methods?.length) {
    return <EmptyState icon={CalendarCheck} title="No payment methods" description="Nothing to close for this day." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-xs tracking-wide text-ink-500 uppercase">
            <th scope="col" className="px-4 py-3 font-medium">Method</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Received</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Fee</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Refunded</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Expected</th>
            <th scope="col" className="px-4 py-3 font-medium">Counted</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Difference</th>
            <th scope="col" className="px-4 py-3 font-medium">Note</th>
            <th scope="col" className="px-4 py-3">
              <span className="sr-only">Save</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {closing.methods.map((row) => (
            <MethodRow key={`${closing.date}-${row.method}-${row.closed_at || "open"}-${row.counted ?? ""}`} date={closing.date} row={row} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink-100 font-semibold text-ink-900">
            <td className="px-4 py-3">Total</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(closing.totals.received)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(closing.methods.reduce((sum, row) => sum + Number(row.fee || 0), 0))}</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(closing.totals.refunded)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(closing.totals.expected)}</td>
            <td colSpan={4} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Difference({ value }) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return <span className="text-ink-300">—</span>;
  const number = Number(value);
  if (Math.abs(number) < 0.005) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
        <Check className="size-3.5" aria-hidden /> Matches
      </span>
    );
  }
  return <span className={cx("font-semibold tabular-nums", number < 0 ? "text-red-600" : "text-amber-600")}>{number > 0 ? "+" : "−"}{formatBDT(Math.abs(number), { exact: true })}</span>;
}

function MethodRow({ date, row }) {
  const [save, { isLoading }] = useSaveClosingMutation();
  const { notify } = useToast();
  const [counted, setCounted] = useState(row.counted ?? "");
  const [note, setNote] = useState(row.note || "");
  const [error, setError] = useState("");

  const dirty = String(counted) !== String(row.counted ?? "") || note !== (row.note || "");
  const liveDifference = counted === "" ? null : Number(counted) - Number(row.expected);
  const difference = dirty ? liveDifference : (row.difference ?? liveDifference);

  async function submit() {
    setError("");
    if (counted === "") {
      setError("Enter the amount you counted.");
      return;
    }
    try {
      await save({ date, method: row.method, counted, note: note || null }).unwrap();
      notify(`${row.label} closing saved.`);
    } catch (err) {
      const message = err.errors ? Object.values(err.errors)[0][0] : err.message;
      setError(message);
      notify(message, "error");
    }
  }

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <p className="font-medium text-ink-900">{row.label}</p>
        <p className="text-xs text-ink-400">
          {row.entries} entr{row.entries === 1 ? "y" : "ies"}
          {row.closed_at && (
            <>
              {" · "}
              <span title={formatDateTime(row.closed_at)}>closed by {row.closed_by || "—"}</span>
            </>
          )}
        </p>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{money(row.received)}</td>
      <td className="px-4 py-3 text-right text-ink-500 tabular-nums">{money(row.fee)}</td>
      <td className="px-4 py-3 text-right text-ink-500 tabular-nums">{money(row.refunded)}</td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(row.expected)}</td>
      <td className="px-4 py-3">
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          aria-label={`Counted for ${row.label}`}
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          placeholder="0.00"
          className="h-9 w-28 rounded-lg border-0 px-2 text-right text-sm tabular-nums ring-1 ring-ink-200 ring-inset focus:ring-2 focus:ring-gold-500 focus:outline-none"
        />
        {error && <p className="mt-1 max-w-48 text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <Difference value={difference} />
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          aria-label={`Note for ${row.label}`}
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional"
          className="h-9 w-44 rounded-lg border-0 px-2 text-sm ring-1 ring-ink-200 ring-inset placeholder:text-ink-300 focus:ring-2 focus:ring-gold-500 focus:outline-none"
        />
      </td>
      <td className="px-4 py-3 text-right">
        <Button size="sm" variant={dirty || !row.closed_at ? "primary" : "secondary"} loading={isLoading} onClick={submit} disabled={!dirty && Boolean(row.closed_at)}>
          {row.closed_at && !dirty ? "Saved" : "Save"}
        </Button>
      </td>
    </tr>
  );
}

function Receivables({ orders }) {
  return (
    <Table
      rows={orders}
      empty={<EmptyState icon={Hourglass} title="Nothing outstanding" description="Every order is fully paid." />}
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
        {
          key: "customer",
          label: "Customer",
          className: "hidden sm:table-cell",
          render: (order) => (
            <div>
              <p className="text-ink-800">{order.customer_name || <span className="text-ink-300">Walk-in</span>}</p>
              {order.customer_phone && <p className="text-xs text-ink-400">{order.customer_phone}</p>}
            </div>
          ),
        },
        { key: "status", label: "Status", render: (order) => <StatusBadge status={order.status} /> },
        {
          key: "courier",
          label: "Courier / payment",
          className: "hidden md:table-cell text-ink-500",
          render: (order) => [order.courier_name, methodLabel(order.payment_method)].filter(Boolean).join(" · ") || "—",
        },
        { key: "grand_total", label: "Total", align: "right", className: "hidden lg:table-cell", render: (order) => formatBDT(order.grand_total) },
        { key: "paid", label: "Paid", align: "right", className: "hidden lg:table-cell text-ink-500", render: (order) => formatBDT(order.paid) },
        { key: "due", label: "Due", align: "right", render: (order) => <span className="font-semibold">{formatBDT(order.due)}</span> },
        {
          key: "days_out",
          label: "Out for",
          align: "right",
          render: (order) =>
            order.days_out === null || order.days_out === undefined ? (
              <span className="text-ink-300">—</span>
            ) : order.days_out > 7 ? (
              <Badge tone="red">{order.days_out} days</Badge>
            ) : (
              <span className="text-ink-500">
                {order.days_out} day{order.days_out === 1 ? "" : "s"}
              </span>
            ),
        },
      ]}
    />
  );
}
