"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CheckCircle2, Minus, PackageSearch, Plus, Printer, Search, Trash2 } from "lucide-react";
import { useCreateManualSaleMutation, useProductSearchQuery } from "@/store/admin/ordersApi";
import { addLine, removeLine, resetSale, setChannel, setSaleStatus, updateLine } from "@/store/admin/posSlice";
import { usePublicSettings } from "@/components/admin/usePublicSettings";
import { PAYMENT_METHODS, SALES_CHANNELS } from "@/lib/admin-options";
import { formatBDT } from "@/lib/format";
import { Button, Card, cx, EmptyState, Input, PageHeader, Select, Spinner, Textarea, useToast } from "@/components/admin/ui";

export default function NewSale() {
  const [completed, setCompleted] = useState(null);

  if (completed) {
    return <SaleComplete order={completed} onNext={() => setCompleted(null)} />;
  }

  return (
    <>
      <PageHeader title="New sale" description="Record a Facebook, WhatsApp, Instagram or in-store sale. Stock updates automatically." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ProductPicker />
        </div>
        <div className="lg:col-span-2">
          <Basket onComplete={setCompleted} />
        </div>
      </div>
    </>
  );
}

function ProductPicker() {
  const dispatch = useDispatch();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const { data, isFetching } = useProductSearchQuery(debounced);
  const products = data?.data || [];

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Card padded={false}>
      <div className="border-b border-ink-100 p-4">
        <label className="relative block">
          <span className="sr-only">Search products</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-300" aria-hidden />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by product name or SKU"
            className="h-11 w-full rounded-lg border-0 pr-10 pl-9 text-sm ring-1 ring-ink-200 ring-inset placeholder:text-ink-300 focus:ring-2 focus:ring-gold-500 focus:outline-none"
          />
          {isFetching && <Spinner className="absolute top-1/2 right-3 size-4 -translate-y-1/2" />}
        </label>
      </div>

      {products.length === 0 && !isFetching ? (
        <EmptyState icon={PackageSearch} title="No products found" description="Only active products can be sold. Check the spelling or the product status." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {products.map((product) => (
            <li key={product.id} className="flex gap-3 p-4">
              <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-cream-200">
                {product.primary_image && (
                  // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail from the API host
                  <img src={product.primary_image.urls.sm} alt="" className="size-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink-900">{product.name}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {product.variants
                    .filter((variant) => variant.is_active)
                    .map((variant) => {
                      const soldOut = variant.stock_available <= 0 && !variant.allow_backorder;
                      return (
                        <button
                          key={variant.id}
                          type="button"
                          disabled={soldOut}
                          onClick={() =>
                            dispatch(
                              addLine({
                                variantId: variant.id,
                                productName: product.name,
                                variantTitle: variant.title,
                                sku: variant.sku,
                                price: variant.price,
                                available: variant.stock_available,
                                allowBackorder: variant.allow_backorder,
                              }),
                            )
                          }
                          className="rounded-lg px-3 py-2 text-left text-xs ring-1 ring-ink-200 transition hover:bg-cream-100 hover:ring-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span className="block font-medium text-ink-800">{variant.title === "Default" ? "Add" : variant.title}</span>
                          <span className="text-ink-500">
                            {formatBDT(variant.price)} · {variant.allow_backorder ? "made to order" : soldOut ? "sold out" : `${variant.stock_available} left`}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Basket({ onComplete }) {
  const dispatch = useDispatch();
  const { lines, channel, status } = useSelector((state) => state.pos);
  const settings = usePublicSettings();
  const zones = settings?.delivery_zones || [];
  const [createSale, { isLoading }] = useCreateManualSaleMutation();
  const { notify } = useToast();
  const [form, setForm] = useState({ name: "", phone: "", address: "", area: "", city: "", zone: "", delivery: "", discount: "", method: "cash", amount: "", transaction_id: "", note: "" });
  const [errors, setErrors] = useState({});
  const needsCourier = status === "confirmed";

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + Number(line.unitPrice || 0) * line.quantity, 0), [lines]);
  const zoneCharge = zones.find((zone) => String(zone.id) === form.zone)?.charge;
  const delivery = form.delivery !== "" ? Number(form.delivery) : needsCourier && zoneCharge ? Number(zoneCharge) : 0;
  const discount = Math.min(Number(form.discount || 0), subtotal);
  const total = subtotal - discount + delivery;

  async function submit() {
    setErrors({});
    if (lines.length === 0) {
      setErrors({ items: "Add at least one product." });
      return;
    }

    const payload = {
      channel,
      status,
      customer: form.name || form.phone ? { name: form.name || null, phone: form.phone || null } : null,
      shipping: needsCourier ? { address: form.address, area: form.area || null, city: form.city, delivery_zone_id: form.zone ? Number(form.zone) : null } : null,
      items: lines.map((line) => ({ variant_id: line.variantId, quantity: line.quantity, unit_price: String(line.unitPrice) })),
      manual_discount: form.discount || null,
      delivery_charge: String(delivery),
      payment: {
        method: form.method,
        // Empty = server records the exact order total (for handed-over sales).
        amount: form.amount !== "" ? form.amount : null,
        transaction_id: form.transaction_id || null,
      },
      note: form.note || null,
    };

    try {
      const result = await createSale(payload).unwrap();
      dispatch(resetSale());
      notify(`Sale ${result.data.order_number} saved.`);
      onComplete(result.data);
    } catch (error) {
      const fieldErrors = {};
      Object.entries(error.errors || {}).forEach(([key, messages]) => {
        fieldErrors[key] = messages[0];
      });
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: error.message });
    }
  }

  return (
    <div className="space-y-4 lg:sticky lg:top-6">
      <Card title={`Basket${lines.length ? ` (${lines.length})` : ""}`} padded={false}>
        {lines.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-400">Tap a product to add it.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {lines.map((line, index) => {
              const overStock = !line.allowBackorder && line.quantity > line.available;
              const stockError = errors[`items.${index}.quantity`];
              return (
                <li key={line.variantId} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{line.productName}</p>
                      <p className="text-xs text-ink-400">{line.variantTitle !== "Default" ? line.variantTitle : line.sku}</p>
                    </div>
                    <button type="button" onClick={() => dispatch(removeLine(line.variantId))} className="rounded p-1 text-ink-300 hover:text-red-600" aria-label={`Remove ${line.productName}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center rounded-lg ring-1 ring-ink-200">
                      <button type="button" className="p-2 text-ink-500 hover:text-ink-900" aria-label="Decrease quantity" onClick={() => line.quantity > 1 && dispatch(updateLine({ variantId: line.variantId, quantity: line.quantity - 1 }))}>
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm tabular-nums">{line.quantity}</span>
                      <button type="button" className="p-2 text-ink-500 hover:text-ink-900" aria-label="Increase quantity" onClick={() => dispatch(updateLine({ variantId: line.variantId, quantity: line.quantity + 1 }))}>
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <label className="flex items-center gap-1 text-sm">
                      <span className="text-ink-400">৳</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="decimal"
                        value={line.unitPrice}
                        onChange={(event) => dispatch(updateLine({ variantId: line.variantId, unitPrice: event.target.value }))}
                        className="h-8 w-24 rounded-md border-0 px-2 text-right text-sm tabular-nums ring-1 ring-ink-200 ring-inset focus:ring-2 focus:ring-gold-500 focus:outline-none"
                        aria-label={`Unit price for ${line.productName}`}
                      />
                    </label>
                  </div>
                  {(overStock || stockError) && <p className="mt-1 text-xs text-red-600">{stockError || `Only ${line.available} in stock.`}</p>}
                </li>
              );
            })}
          </ul>
        )}
        {errors.items && <p className="px-4 pb-3 text-sm text-red-600">{errors.items}</p>}
      </Card>

      <Card title="Sale details">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Channel" options={SALES_CHANNELS.filter((option) => option.value !== "website")} value={channel} onChange={(event) => dispatch(setChannel(event.target.value))} />
            <Select
              label="Handover"
              options={[
                { value: "delivered", label: "Handed over now" },
                { value: "confirmed", label: "Send by courier" },
              ]}
              value={status}
              onChange={(event) => dispatch(setSaleStatus(event.target.value))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Customer name" value={form.name} onChange={set("name")} error={errors["customer.name"]} />
            <Input label="Phone" inputMode="tel" placeholder="01XXXXXXXXX" required={needsCourier} value={form.phone} onChange={set("phone")} error={errors["customer.phone"]} />
          </div>

          {needsCourier && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-cream-100 p-3">
              <Input className="col-span-2" label="Address" required value={form.address} onChange={set("address")} error={errors["shipping.address"]} />
              <Input label="Area" value={form.area} onChange={set("area")} />
              <Input label="City" required value={form.city} onChange={set("city")} error={errors["shipping.city"]} />
              <Select label="Delivery zone" placeholder="Choose" options={zones.map((zone) => ({ value: String(zone.id), label: `${zone.name} (${formatBDT(zone.charge)})` }))} value={form.zone} onChange={set("zone")} />
              <Input label="Delivery charge" type="number" min="0" inputMode="decimal" placeholder={zoneCharge ?? "0"} value={form.delivery} onChange={set("delivery")} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="Discount (৳)" type="number" min="0" inputMode="decimal" value={form.discount} onChange={set("discount")} error={errors.manual_discount} />
            <Select label="Payment" options={PAYMENT_METHODS} value={form.method} onChange={set("method")} />
            <Input
              label="Amount received"
              type="number"
              min="0"
              inputMode="decimal"
              placeholder={status === "delivered" ? String(total) : "0"}
              hint={status === "confirmed" ? "Leave empty for cash on delivery." : "Empty = paid in full."}
              value={form.amount}
              onChange={set("amount")}
              error={errors["payment.amount"]}
            />
            {form.method !== "cash" && form.method !== "cod" && <Input label="Transaction ID" value={form.transaction_id} onChange={set("transaction_id")} error={errors["payment.transaction_id"]} />}
          </div>

          <Textarea label="Note" rows={2} value={form.note} onChange={set("note")} />
        </div>
      </Card>

      <Card>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between text-ink-600">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatBDT(subtotal)}</dd>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-ink-600">
              <dt>Discount</dt>
              <dd className="tabular-nums">− {formatBDT(discount)}</dd>
            </div>
          )}
          {delivery > 0 && (
            <div className="flex justify-between text-ink-600">
              <dt>Delivery</dt>
              <dd className="tabular-nums">{formatBDT(delivery)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-ink-100 pt-2 text-lg font-semibold text-ink-900">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatBDT(total)}</dd>
          </div>
        </dl>
        {errors.form && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}
        <Button variant="gold" size="lg" className="mt-4 w-full" loading={isLoading} onClick={submit} disabled={lines.length === 0}>
          Confirm sale
        </Button>
        {lines.length > 0 && (
          <button type="button" onClick={() => dispatch(resetSale())} className="mt-2 w-full text-center text-xs text-ink-400 hover:text-red-600">
            Clear basket
          </button>
        )}
      </Card>
    </div>
  );
}

function SaleComplete({ order, onNext }) {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <CheckCircle2 className="mx-auto size-14 text-emerald-600" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold text-ink-900">Sale saved</h1>
      <p className="mt-1 text-ink-500">
        {order.order_number} · {formatBDT(order.grand_total)} · {order.channel_label}
      </p>
      <div className={cx("mt-8 grid gap-3", "sm:grid-cols-3")}>
        <Link href={`/admin/invoice/${order.id}`} target="_blank">
          <Button variant="secondary" className="w-full">
            <Printer className="size-4" /> Receipt
          </Button>
        </Link>
        <Link href={`/admin/orders/${order.id}`}>
          <Button variant="secondary" className="w-full">
            View order
          </Button>
        </Link>
        <Button variant="gold" onClick={onNext} className="w-full">
          New sale
        </Button>
      </div>
    </div>
  );
}
