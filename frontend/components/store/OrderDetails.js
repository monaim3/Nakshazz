import { Check, Circle, Package, Truck, XCircle } from "lucide-react";
import { localizeDigits } from "@/lib/i18n";
import { formatPrice } from "./Price";

const FLOW = ["pending", "confirmed", "processing", "shipped", "delivered"];

/** Order summary shared by the confirmation page and order tracking. */
export default function OrderDetails({ order, lang, t }) {
  const n = (value) => localizeDigits(String(value), lang);
  const money = (value) => formatPrice(value, lang);
  const stopped = ["cancelled", "returned"].includes(order.status);
  const reached = FLOW.indexOf(order.status);
  const dateFor = (status) => order.timeline?.find((entry) => entry.status === status)?.at;
  const fmtDate = (iso) => (iso ? new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ivory-100 px-5 py-4">
        <div>
          <p className="text-xs tracking-[0.18em] text-ink/55 uppercase">{t.orderNumber}</p>
          <p className="font-display text-2xl text-navy-900">{order.order_number}</p>
        </div>
        <span className={`rounded-full px-4 py-1.5 text-sm font-medium ${stopped ? "bg-lotus-50 text-lotus-600" : "bg-teal-100 text-teal-500"}`}>{t.statuses[order.status] || order.status}</span>
      </div>

      {/* Progress */}
      {stopped ? (
        <p className="flex items-center gap-2 rounded-2xl border border-lotus-200 p-4 text-sm text-lotus-700">
          <XCircle className="size-5" /> {t.statuses[order.status]} {fmtDate(dateFor(order.status)) && `· ${fmtDate(dateFor(order.status))}`}
        </p>
      ) : (
        <ol className="grid grid-cols-5 gap-1">
          {FLOW.map((status, i) => {
            const done = i <= reached;
            const Icon = status === "shipped" ? Truck : status === "delivered" ? Package : done ? Check : Circle;
            return (
              <li key={status} className="flex flex-col items-center text-center">
                <span className={`flex size-9 items-center justify-center rounded-full ${done ? "bg-navy-900 text-white" : "bg-ivory-200 text-ink/40"}`}>
                  <Icon className="size-4" />
                </span>
                <span className={`mt-2 text-[11px] leading-tight sm:text-xs ${done ? "text-navy-900" : "text-ink/45"}`}>{t.statuses[status]}</span>
                {done && dateFor(status) && <span className="mt-0.5 hidden text-[10px] text-ink/45 sm:block">{fmtDate(dateFor(status))}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {order.tracking_code && (
        <p className="rounded-2xl border border-ivory-200 p-4 text-sm">
          {t.courier}: <strong>{order.courier_name}</strong> · {t.trackingCode}: <strong className="tabular-nums">{order.tracking_code}</strong>
        </p>
      )}

      <div className="rounded-2xl border border-ivory-200 bg-white p-5">
        <ul className="divide-y divide-ivory-200">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-3 py-3 text-sm">
              <span>
                <span className="font-medium text-navy-900">{item.product_name}</span>
                {item.variant_title && <span className="text-ink/55"> · {item.variant_title}</span>}
                <span className="text-ink/55"> × {n(item.quantity)}</span>
              </span>
              <span className="tabular-nums">{money(item.line_subtotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1.5 border-t border-ivory-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink/65">{t.subtotal}</dt>
            <dd className="tabular-nums">{money(order.totals.items_subtotal)}</dd>
          </div>
          {Number(order.totals.discount) > 0 && (
            <div className="flex justify-between text-teal-500">
              <dt>{t.discount}</dt>
              <dd className="tabular-nums">− {money(order.totals.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-ink/65">
              {t.deliveryCharge} {order.delivery_zone && `(${order.delivery_zone})`}
            </dt>
            <dd className="tabular-nums">{money(order.totals.delivery_charge)}</dd>
          </div>
          <div className="flex justify-between border-t border-ivory-200 pt-2 text-base font-semibold text-navy-900">
            <dt>{t.total}</dt>
            <dd className="tabular-nums">{money(order.totals.grand_total)}</dd>
          </div>
        </dl>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <Info label={t.name} value={order.customer_name} />
        <Info label={t.phone} value={order.customer_phone} />
        <Info label={t.payment} value={`${order.payment_method_label} · ${t.paymentStatuses[order.payment_status] || order.payment_status}`} />
      </dl>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl bg-ivory-100 p-4">
      <dt className="text-xs text-ink/55">{label}</dt>
      <dd className="mt-0.5 font-medium text-navy-900">{value}</dd>
    </div>
  );
}
