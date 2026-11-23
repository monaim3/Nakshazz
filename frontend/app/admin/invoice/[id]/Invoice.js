"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { useOrderQuery } from "@/store/admin/ordersApi";
import { formatBDT, formatDate } from "@/lib/format";
import { Button, ErrorBlock, LoadingBlock } from "@/components/admin/ui";

/** Public store details (name, phone, address) for the invoice header. */
function useStoreDetails() {
  const [store, setStore] = useState(null);
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => setStore(json?.data?.store || {}))
      .catch(() => setStore({}));
  }, []);
  return store;
}

/**
 * Branded invoice / receipt, A4 when printed: navy header with the badge logo, the folk
 * dot rule, product photos, a clear total and a stamp (paid, collect on delivery, cancelled).
 */
export default function Invoice() {
  const { id } = useParams();
  const { data, error, isLoading } = useOrderQuery(id);
  const store = useStoreDetails();

  if (isLoading || !store) return <LoadingBlock />;
  if (error?.status === 401) {
    return (
      <p className="p-10 text-center text-sm">
        Please <Link href={`/admin/login?next=/admin/invoice/${id}`} className="underline">sign in</Link> to view this invoice.
      </p>
    );
  }
  if (error) return <ErrorBlock error={error} />;

  const order = data.data;
  const total = Number(order.grand_total);
  const discount = Number(order.coupon_discount) + Number(order.manual_discount);
  const paid = order.payments.filter((payment) => payment.type === "payment" && payment.status === "verified").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const due = Math.max(0, total - paid);
  const status = typeof order.status === "string" ? order.status : order.status?.value;
  const stamp =
    status === "cancelled"
      ? { text: "Cancelled", tone: "border-red-600 text-red-600" }
      : due <= 0 || status === "delivered"
        ? { text: "Paid", tone: "border-emerald-600 text-emerald-600" }
        : null;
  const address = [order.shipping.address, order.shipping.area, order.shipping.city].filter(Boolean).join(", ");
  const website = (process.env.NEXT_PUBLIC_SITE_URL || "https://nakshazz.com").replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="min-h-screen bg-cream-100 py-8 print:min-h-0 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end gap-2 px-4">
        <Link href={`/admin/orders/${order.id}`}>
          <Button variant="secondary">Back to order</Button>
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Print
        </Button>
      </div>

      <article className="invoice relative mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_-30px_rgba(10,18,38,0.45)] ring-1 ring-ink-100 print:max-w-none print:rounded-none print:shadow-none print:ring-0">
        {/* signature gradient, the colours of the logo */}
        <div className="h-1.5 bg-[linear-gradient(90deg,var(--color-lotus-500),var(--color-saffron),var(--color-marigold-400))]" />

        <header className="flex flex-wrap items-center justify-between gap-6 bg-navy-950 px-8 py-7 text-white sm:px-10">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- printed page: plain img prints reliably */}
            <img src="/brand/logo-badge-320.webp" alt="Nakshazz" className="size-20 shrink-0 drop-shadow-lg" />
            <div>
              <p className="font-display text-3xl leading-none">{store.store_name || "Nakshazz"}</p>
              <p className="mt-1.5 text-[11px] tracking-[0.25em] text-gold-light uppercase">Handmade jewellery</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] tracking-[0.35em] text-gold-light uppercase">Invoice</p>
            <p className="mt-1 font-display text-3xl leading-none [font-variant-numeric:lining-nums]">{order.order_number}</p>
            <p className="mt-1.5 text-xs text-white/65">{formatDate(order.placed_at)}</p>
          </div>
        </header>

        <div className="relative px-8 pt-8 pb-10 sm:px-10">
          <section className="grid gap-6 text-sm [overflow-wrap:anywhere] sm:grid-cols-3">
            <Block title="Billed to">
              <p className="font-semibold text-ink-900">{order.customer_name || "Walk-in customer"}</p>
              {order.customer_phone && <p className="text-ink-600">{order.customer_phone}</p>}
              {order.customer_email && <p className="text-ink-600">{order.customer_email}</p>}
            </Block>
            <Block title="Deliver to">
              {address ? <p className="text-ink-700">{address}</p> : <p className="text-ink-500">Collected in person</p>}
              {order.shipping.zone && <p className="mt-0.5 text-ink-500">{order.shipping.zone}</p>}
            </Block>
            <Block title="Payment">
              <p className="text-ink-800">{order.payment_method_label}</p>
              <p className="text-ink-500">Sold via {order.channel_label}</p>
            </Block>
          </section>

          <div className="folk-rule my-7" />

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] tracking-[0.15em] text-ink-400 uppercase">
                <th className="pb-3 font-medium">Item</th>
                <th className="pb-3 text-right font-medium">Qty</th>
                <th className="pb-3 text-right font-medium">Price</th>
                <th className="pb-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 border-y border-ink-100">
              {order.items.map((item) => (
                <tr key={item.id} className="break-inside-avoid">
                  <td className="py-3.5 pr-3">
                    <div className="flex items-center gap-3">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- product photo from the API host
                        <img src={item.image_url} alt="" className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-ink-100" />
                      ) : (
                        <span className="size-12 shrink-0 rounded-lg bg-cream-100 ring-1 ring-ink-100" />
                      )}
                      <div>
                        <p className="font-medium text-ink-900">{item.product_name}</p>
                        <p className="text-xs text-ink-400">
                          {item.variant_title && item.variant_title !== "Default" && `${item.variant_title} · `}
                          {item.sku}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-3.5 text-right tabular-nums text-ink-600">{formatBDT(item.unit_price)}</td>
                  <td className="py-3.5 text-right font-medium tabular-nums text-ink-900">{formatBDT(item.line_subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xs text-xs text-ink-500">
              {stamp && (
                <p className={`mb-4 inline-block -rotate-6 rounded-lg border-[3px] px-5 py-1 font-display text-3xl tracking-[0.25em] uppercase opacity-75 ${stamp.tone}`}>{stamp.text}</p>
              )}
              {order.coupon_code && (
                <p>
                  Coupon <span className="font-medium text-ink-700">{order.coupon_code}</span> applied
                </p>
              )}
              {order.customer_note && <p className="mt-1 italic">“{order.customer_note}”</p>}
            </div>
            <dl className="w-full max-w-xs space-y-2 text-sm">
              <Row label="Subtotal" value={formatBDT(order.items_subtotal)} />
              {discount > 0 && <Row label="Discount" value={`− ${formatBDT(discount)}`} />}
              <Row label={order.shipping.zone ? `Delivery · ${order.shipping.zone}` : "Delivery"} value={Number(order.delivery_charge) > 0 ? formatBDT(order.delivery_charge) : "Free"} />
              {paid > 0 && due > 0 && <Row label="Paid" value={`− ${formatBDT(paid)}`} />}
              <div className="mt-3 flex items-center justify-between rounded-xl bg-navy-950 px-4 py-3 text-white">
                <dt className="text-xs tracking-[0.2em] uppercase">{paid > 0 && due > 0 ? "Due" : "Total"}</dt>
                <dd className="font-display text-2xl [font-variant-numeric:lining-nums_tabular-nums]">{formatBDT(paid > 0 && due > 0 ? due : total)}</dd>
              </div>
              {!stamp && due > 0 && order.payment_method === "cod" && (
                <p className="pt-1 text-right text-xs font-medium text-lotus-600">Please pay {formatBDT(due)} to the delivery person</p>
              )}
            </dl>
          </div>
        </div>

        <footer className="border-t border-ink-100 bg-cream-50 px-8 py-6 text-center sm:px-10">
          <p className="font-display text-xl text-navy-900 italic">Thank you for choosing handmade.</p>
          <p className="mt-1 text-xs text-ink-500">Every piece is made by hand in Bangladesh, so small variations are part of its charm.</p>
          <p className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-600">
            <span>{website}</span>
            {store.phone && <span>{store.phone}</span>}
            {store.email && <span>{store.email}</span>}
            {store.address && <span>{store.address}</span>}
          </p>
        </footer>
      </article>
    </div>
  );
}

function Block({ title, children }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium tracking-[0.15em] text-gold-700 uppercase">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 text-ink-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
