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
  const discount = Number(order.coupon_discount) + Number(order.manual_discount);
  const paid = order.payments.filter((payment) => payment.type === "payment" && payment.status === "verified").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const logoUrl = store.logo_path ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/storage/${store.logo_path}` : null;

  return (
    <div className="min-h-screen bg-cream-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-2xl justify-end gap-2 px-4">
        <Link href={`/admin/orders/${order.id}`}>
          <Button variant="secondary">Back to order</Button>
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Print
        </Button>
      </div>

      <article className="mx-auto max-w-2xl bg-white px-8 py-10 shadow-sm ring-1 ring-ink-100 print:max-w-none print:px-0 print:py-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between gap-6 border-b border-ink-100 pb-6">
          <div>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- printed page, served from the API host
              <img src={logoUrl} alt={store.store_name} className="h-12 w-auto" />
            ) : (
              <p className="font-display text-3xl text-ink-900">{store.store_name || "Nakshazz"}</p>
            )}
            <div className="mt-2 space-y-0.5 text-xs text-ink-500">
              {store.address && <p>{store.address}</p>}
              {store.phone && <p>{store.phone}</p>}
              {store.email && <p>{store.email}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs tracking-[0.2em] text-gold-600 uppercase">Invoice</p>
            <p className="mt-1 text-lg font-semibold text-ink-900">{order.order_number}</p>
            <p className="text-xs text-ink-500">{formatDate(order.placed_at)}</p>
          </div>
        </header>

        <section className="grid gap-6 py-6 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-ink-400 uppercase">Billed to</p>
            <p className="font-medium text-ink-900">{order.customer_name || "Walk-in customer"}</p>
            {order.customer_phone && <p className="text-ink-600">{order.customer_phone}</p>}
            {order.shipping.address && (
              <p className="text-ink-600">
                {order.shipping.address}
                {order.shipping.area && `, ${order.shipping.area}`}
                {order.shipping.city && `, ${order.shipping.city}`}
              </p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="mb-1 text-xs font-medium tracking-wide text-ink-400 uppercase">Payment</p>
            <p className="text-ink-700">{order.payment_method_label}</p>
            <p className="text-ink-500">Sold via {order.channel_label}</p>
          </div>
        </section>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-ink-100 text-left text-xs tracking-wide text-ink-400 uppercase">
              <th className="py-2 font-medium">Item</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Price</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {order.items.map((item) => (
              <tr key={item.id}>
                <td className="py-3">
                  <p className="text-ink-900">{item.product_name}</p>
                  <p className="text-xs text-ink-400">{item.variant_title !== "Default" && `${item.variant_title} · `}{item.sku}</p>
                </td>
                <td className="py-3 text-right tabular-nums">{item.quantity}</td>
                <td className="py-3 text-right tabular-nums">{formatBDT(item.unit_price)}</td>
                <td className="py-3 text-right tabular-nums">{formatBDT(item.line_subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 ml-auto w-full max-w-xs space-y-1.5 border-t border-ink-100 pt-4 text-sm">
          <InvoiceRow label="Subtotal" value={formatBDT(order.items_subtotal)} />
          {discount > 0 && <InvoiceRow label="Discount" value={`− ${formatBDT(discount)}`} />}
          {Number(order.delivery_charge) > 0 && <InvoiceRow label="Delivery" value={formatBDT(order.delivery_charge)} />}
          <InvoiceRow label="Total" value={formatBDT(order.grand_total)} strong />
          {paid > 0 && <InvoiceRow label="Paid" value={formatBDT(paid)} />}
          {paid > 0 && paid < Number(order.grand_total) && <InvoiceRow label="Due" value={formatBDT(Number(order.grand_total) - paid)} strong />}
        </dl>

        <footer className="mt-10 border-t border-ink-100 pt-6 text-center text-xs text-ink-400">
          <p className="font-display text-base text-ink-700">Thank you for choosing handmade.</p>
          {store.facebook_url && <p className="mt-1">{store.facebook_url}</p>}
        </footer>
      </article>
    </div>
  );
}

function InvoiceRow({ label, value, strong }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold text-ink-900" : "text-ink-600"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
