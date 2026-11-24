"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, Banknote, Check, ChevronLeft, Copy, Loader2, Lock, ShoppingBag, Tag, X } from "lucide-react";
import { readCart, syncCartWithQuote, useCart, writeCart } from "@/lib/cart-storage";
import { priceChangedText } from "./CartDrawer";
import { localePath, localizeDigits } from "@/lib/i18n";
import { formatPrice } from "./Price";

const API = process.env.NEXT_PUBLIC_API_URL;
const SAVED_KEY = "nakshazz-checkout-details-v1";
const BD_PHONE = /^(?:\+?88)?01[3-9]\d{8}$/;

const digits = (value) => String(value || "").replace(/[\s-]/g, "");

function buildSchema(t, methods) {
  return z
    .object({
      name: z.string().trim().min(2, t.errors.name).max(100),
      phone: z.string().transform(digits).refine((v) => BD_PHONE.test(v), t.errors.phone),
      email: z.union([z.literal(""), z.string().trim().email(t.errors.email).max(150)]),
      address: z.string().trim().min(5, t.errors.address).max(255),
      area: z.string().trim().max(100),
      city: z.string().trim().min(2, t.errors.city).max(100),
      zone: z.coerce.number({ message: t.errors.zone }).int().positive(t.errors.zone),
      method: z.enum(methods),
      sender: z.string(),
      trx: z.string(),
      note: z.string().max(500),
      website: z.string().max(0),
    })
    .superRefine((value, ctx) => {
      if (value.method !== "bkash") return;
      if (!BD_PHONE.test(digits(value.sender))) ctx.addIssue({ code: "custom", path: ["sender"], message: t.errors.phone });
      if (!/^[A-Za-z0-9]{8,20}$/.test(value.trx.trim())) ctx.addIssue({ code: "custom", path: ["trx"], message: t.errors.trx });
    });
}

/** One key per checkout attempt: a retry or double tap of the same submit can't make two orders. */
function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function readSaved() {
  try {
    return JSON.parse(window.localStorage.getItem(SAVED_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Guest checkout. Prices, discount, delivery charge and stock are always quoted by the
 * server (/cart/validate) and the order is created by /checkout, which re-checks everything.
 */
export default function CheckoutForm({ lang, t, zones, methods, bkash }) {
  const router = useRouter();
  const lines = useCart();
  const schema = useMemo(() => buildSchema(t, methods), [t, methods]);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", email: "", address: "", area: "", city: "", zone: "", method: methods[0], sender: "", trx: "", note: "", website: "" },
  });

  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(false);
  const [remember, setRemember] = useState(true);
  const [priceNotes, setPriceNotes] = useState({});
  const [attemptKey, setAttemptKey] = useState(null);

  const [zone, phone, method] = useWatch({ control, name: ["zone", "phone", "method"] });

  // Prefill details from the last order on this device (never payment fields)
  useEffect(() => {
    const saved = readSaved();
    for (const key of ["name", "phone", "email", "address", "area", "city", "zone"]) {
      if (saved[key]) setValue(key, String(saved[key]));
    }
  }, [setValue]);

  // Server quote: lines, coupon, delivery charge, totals
  useEffect(() => {
    if (lines.length === 0) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setQuoting(true);
      fetch(`${API}/cart/validate`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          items: lines.map((line) => ({ variant_id: line.variantId, quantity: line.quantity })),
          coupon_code: coupon || undefined,
          delivery_zone_id: zone ? Number(zone) : undefined,
          phone: BD_PHONE.test(digits(phone)) ? digits(phone) : undefined,
        }),
      })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then(({ data }) => {
          setQuote(data);
          // prices only: stock problems stay visible here so the shopper decides
          const changes = syncCartWithQuote(data.lines, { stock: false });
          if (changes.length) setPriceNotes((notes) => ({ ...notes, ...Object.fromEntries(changes.map((change) => [change.variantId, change])) }));
        })
        .catch((reason) => reason.name !== "AbortError" && setFormError(t.quoteError))
        .finally(() => setQuoting(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [lines, coupon, zone, phone, t.quoteError]);

  const n = (value) => localizeDigits(String(value), lang);
  const money = (value) => formatPrice(value, lang);

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <ShoppingBag className="size-10 text-ink/30" strokeWidth={1.5} />
        <p className="mt-4 font-display text-2xl text-navy-900">{t.emptyTitle}</p>
        <Link href={localePath(lang, "/shop")} className="mt-6 rounded-full bg-navy-900 px-8 py-3 text-sm font-medium text-white">
          {t.continueShopping}
        </Link>
      </div>
    );
  }

  async function onSubmit(values) {
    setFormError("");
    if (!quote || quote.has_problems) {
      setFormError(t.fixBag);
      return;
    }
    setSubmitting(true);
    // same key for every retry of this attempt; replaced once an order is placed
    const idempotencyKey = attemptKey ?? newIdempotencyKey();
    setAttemptKey(idempotencyKey);
    try {
      const response = await fetch(`${API}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          customer: { name: values.name, phone: values.phone, email: values.email || undefined },
          shipping: { address: values.address, area: values.area || undefined, city: values.city, delivery_zone_id: values.zone },
          items: readCart().map((line) => ({ variant_id: line.variantId, quantity: line.quantity })),
          coupon_code: quote.coupon?.valid ? quote.coupon.code : undefined,
          payment: values.method === "bkash" ? { method: "bkash", sender_number: digits(values.sender), transaction_id: values.trx.trim() } : { method: values.method },
          note: values.note || undefined,
          website: values.website,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (response.status === 201) {
        setAttemptKey(null);
        try {
          if (remember) {
            window.localStorage.setItem(SAVED_KEY, JSON.stringify({ name: values.name, phone: values.phone, email: values.email, address: values.address, area: values.area, city: values.city, zone: values.zone }));
          } else {
            window.localStorage.removeItem(SAVED_KEY);
          }
        } catch {
          // ignore
        }
        writeCart([]);
        router.replace(localePath(lang, `/order/${body.data.uuid}?placed=1`));
        return;
      }

      const fieldMap = { "customer.name": "name", "customer.phone": "phone", "customer.email": "email", "shipping.address": "address", "shipping.city": "city", "shipping.area": "area", "shipping.delivery_zone_id": "zone", "payment.sender_number": "sender", "payment.transaction_id": "trx", "payment.method": "method", note: "note" };
      let mapped = false;
      for (const [key, messages] of Object.entries(body.errors || {})) {
        if (fieldMap[key]) {
          setError(fieldMap[key], { message: messages[0] });
          mapped = true;
        }
      }
      if (response.status === 409) {
        setFormError(t.stockChanged);
        writeCart([...readCart()]); // new array -> the quote refreshes and marks the affected lines
      } else if (response.status === 429) {
        setFormError(t.tooMany);
      } else if (!mapped) {
        setFormError(body.message || t.genericError);
      }
    } catch {
      setFormError(t.networkError);
    } finally {
      setSubmitting(false);
    }
  }

  const field = "h-12 w-full rounded-xl border border-ivory-300 bg-white px-4 text-sm text-ink outline-none transition focus:border-navy-900 aria-[invalid=true]:border-lotus-500";
  const label = "mb-1.5 block text-sm font-medium text-navy-900";
  const err = (name) => errors[name] && <p className="mt-1.5 text-xs text-lotus-600">{errors[name].message}</p>;
  const total = quote?.totals;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-10 lg:grid-cols-[1fr_400px] lg:gap-14">
      <div className="space-y-10">
        {/* 1. Contact */}
        <fieldset>
          <legend className="mb-5 font-display text-2xl text-navy-900"> {t.contact}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="co-name">
                {t.name} *
              </label>
              <input id="co-name" autoComplete="name" className={field} aria-invalid={Boolean(errors.name)} {...register("name")} />
              {err("name")}
            </div>
            <div>
              <label className={label} htmlFor="co-phone">
                {t.phone} *
              </label>
              <input id="co-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" className={field} aria-invalid={Boolean(errors.phone)} {...register("phone")} />
              {err("phone")}
            </div>
            <div>
              <label className={label} htmlFor="co-email">
                {t.email} <span className="font-normal text-ink/50">({t.optional})</span>
              </label>
              <input id="co-email" type="email" autoComplete="email" className={field} aria-invalid={Boolean(errors.email)} {...register("email")} />
              {err("email")}
            </div>
          </div>
        </fieldset>

        {/* 2. Delivery */}
        <fieldset>
          <legend className="mb-5 font-display text-2xl text-navy-900"> {t.delivery}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t.zone}>
            {zones.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-ivory-300 bg-white p-4 transition has-checked:border-navy-900 has-checked:ring-1 has-checked:ring-navy-900">
                <span className="flex items-center gap-3">
                  <input type="radio" value={item.id} className="size-4 accent-navy-900" {...register("zone")} />
                  <span className="text-sm font-medium text-navy-900">{item.name}</span>
                </span>
                <span className="text-sm text-ink/70 tabular-nums">{money(item.charge)}</span>
              </label>
            ))}
          </div>
          {err("zone")}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="co-address">
                {t.address} *
              </label>
              <input id="co-address" autoComplete="street-address" placeholder={t.addressHint} className={field} aria-invalid={Boolean(errors.address)} {...register("address")} />
              {err("address")}
            </div>
            <div>
              <label className={label} htmlFor="co-area">
                {t.area} <span className="font-normal text-ink/50">({t.optional})</span>
              </label>
              <input id="co-area" autoComplete="address-level3" className={field} {...register("area")} />
            </div>
            <div>
              <label className={label} htmlFor="co-city">
                {t.city} *
              </label>
              <input id="co-city" autoComplete="address-level2" className={field} aria-invalid={Boolean(errors.city)} {...register("city")} />
              {err("city")}
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="co-note">
                {t.note} <span className="font-normal text-ink/50">({t.optional})</span>
              </label>
              <textarea id="co-note" rows={2} maxLength={500} className={`${field} h-auto py-3`} {...register("note")} />
            </div>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-ink/75">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-navy-900" />
            <span>
              <span className="block font-medium text-navy-900">{t.rememberDetails || (lang === "bn" ? "এই ডিভাইসে আমার তথ্য মনে রাখুন" : "Remember my details on this device")}</span>
              <span className="block text-xs text-ink/55">{t.rememberDetailsHint || (lang === "bn" ? "নাম, ফোন ও ঠিকানা পরের অর্ডারে আগে থেকে পূরণ হবে। শেয়ার করা ফোনে টিক তুলে দিন।" : "Name, phone and address are filled in next time. Untick on a shared phone.")}</span>
            </span>
          </label>
        </fieldset>

        {/* 3. Payment */}
        <fieldset>
          <legend className="mb-5 font-display text-2xl text-navy-900"> {t.payment}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {methods.includes("cod") && (
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-ivory-300 bg-white p-4 transition has-checked:border-navy-900 has-checked:ring-1 has-checked:ring-navy-900">
                <input type="radio" value="cod" className="size-4 accent-navy-900" {...register("method")} />
                <Banknote className="size-5 text-marigold-600" />
                <span>
                  <span className="block text-sm font-medium text-navy-900">{t.cod}</span>
                  <span className="block text-xs text-ink/60">{t.codHint}</span>
                </span>
              </label>
            )}
            {methods.includes("bkash") && (
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-ivory-300 bg-white p-4 transition has-checked:border-[#e2136e] has-checked:ring-1 has-checked:ring-[#e2136e]">
                <input type="radio" value="bkash" className="size-4 accent-[#e2136e]" {...register("method")} />
                {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG */}
                <img src="/brand/bkash.svg" alt="" width="32" height="32" className="size-8 shrink-0" />
                <span>
                  <span className="block text-sm font-medium text-navy-900">{t.bkash}</span>
                  <span className="block text-xs text-ink/60">{t.bkashHint}</span>
                </span>
              </label>
            )}
          </div>

          {method === "bkash" && bkash && (
            <div className="mt-4 rounded-2xl border border-[#e2136e]/30 bg-[#e2136e]/5 p-5 text-sm">
              <p className="text-ink/80">{bkash.instructions}</p>
              <div className="mt-4 grid gap-2 rounded-xl bg-white p-4">
                <p className="flex items-center justify-between gap-3">
                  <span className="text-ink/60">
                    {t.bkashNumber} ({bkash.accountType === "merchant" ? t.merchant : t.personal})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(bkash.number);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="flex items-center gap-1.5 font-semibold text-navy-900 tabular-nums"
                  >
                    {bkash.number} {copied ? <Check className="size-4 text-teal-500" /> : <Copy className="size-4 text-ink/40" />}
                  </button>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span className="text-ink/60">{t.amountToSend}</span>
                  <span className="font-semibold text-[#e2136e] tabular-nums">{total ? money(total.grand_total) : "—"}</span>
                </p>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="co-sender">
                    {t.senderNumber} *
                  </label>
                  <input id="co-sender" type="tel" inputMode="tel" placeholder="01XXXXXXXXX" className={field} aria-invalid={Boolean(errors.sender)} {...register("sender")} />
                  {err("sender")}
                </div>
                <div>
                  <label className={label} htmlFor="co-trx">
                    {t.trxId} *
                  </label>
                  <input id="co-trx" autoCapitalize="characters" autoComplete="off" placeholder="8N7A6D5E4F" className={`${field} uppercase`} aria-invalid={Boolean(errors.trx)} {...register("trx")} />
                  {err("trx")}
                </div>
              </div>
            </div>
          )}
        </fieldset>

        {/* Honeypot: hidden from people, bots fill it */}
        <div className="absolute -left-[9999px]" aria-hidden>
          <label htmlFor="co-website">Website</label>
          <input id="co-website" tabIndex={-1} autoComplete="off" {...register("website")} />
        </div>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-36 lg:self-start">
        <div className="rounded-3xl bg-white p-6 shadow-[0_10px_40px_-20px_rgba(15,27,53,0.25)] ring-1 ring-ivory-200">
          <h2 className="flex items-center justify-between font-display text-2xl text-navy-900">
            {t.summary}
            {quoting && <Loader2 className="size-4 animate-spin text-ink/40" />}
          </h2>
          <ul className="mt-4 divide-y divide-ivory-200">
            {(quote?.lines || []).map((line) => (
              <li key={line.variant_id} className="flex gap-3 py-3">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-ivory-200">
                  {line.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- optimised WebP from the API
                    <img src={line.image.urls.sm} alt="" className="size-full object-cover" />
                  )}
                  <span className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-navy-900 text-[10px] text-white">{n(line.quantity || line.requested_quantity)}</span>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium text-navy-900">{line.product_name || "—"}</p>
                  {line.variant_title && <p className="text-xs text-ink/55">{line.variant_title}</p>}
                  {priceNotes[line.variant_id] && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-marigold-700" role="status">
                      <AlertCircle className="size-3.5 shrink-0" /> {priceChangedText(t, lang, priceNotes[line.variant_id].from, priceNotes[line.variant_id].to)}
                    </p>
                  )}
                  {line.problem && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-lotus-600">
                      <AlertCircle className="size-3.5" /> {t.problems[line.problem]}
                    </p>
                  )}
                </div>
                <span className="text-sm tabular-nums">{line.line_subtotal ? money(line.line_subtotal) : "—"}</span>
              </li>
            ))}
          </ul>

          {/* Coupon */}
          <div className="mt-2 border-t border-ivory-200 pt-4">
            {quote?.coupon?.valid ? (
              <div className="flex items-center justify-between rounded-xl bg-teal-100 px-4 py-2.5 text-sm text-teal-500">
                <span className="flex items-center gap-2">
                  <Tag className="size-4" /> {quote.coupon.code}
                </span>
                <button type="button" onClick={() => setCoupon("")} aria-label={t.removeCoupon}>
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={couponInput} onChange={(event) => setCouponInput(event.target.value.toUpperCase())} placeholder={t.couponPlaceholder} aria-label={t.couponPlaceholder} maxLength={40} className="h-11 w-full rounded-xl border border-ivory-300 px-4 text-sm uppercase outline-none focus:border-navy-900" />
                <button type="button" onClick={() => setCoupon(couponInput.trim())} disabled={!couponInput.trim()} className="h-11 shrink-0 rounded-xl border border-navy-900 px-4 text-sm font-medium text-navy-900 disabled:opacity-40">
                  {t.apply}
                </button>
              </div>
            )}
            {quote?.coupon && !quote.coupon.valid && <p className="mt-1.5 text-xs text-lotus-600">{quote.coupon.message}</p>}
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <Row label={t.subtotal} value={total ? money(total.items_subtotal) : "—"} />
            {total && Number(total.discount) > 0 && <Row label={t.discount} value={`− ${money(total.discount)}`} accent />}
            <Row label={t.deliveryCharge} value={quote?.delivery_zone ? money(total.delivery_charge) : t.chooseZone} />
            <div className="flex items-center justify-between border-t border-ivory-200 pt-3 text-base font-semibold text-navy-900">
              <dt>{t.total}</dt>
              <dd className="text-xl tabular-nums">{total ? money(total.grand_total) : "—"}</dd>
            </div>
          </dl>

          {formError && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-lotus-50 p-3 text-sm text-lotus-700" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" /> {formError}
            </p>
          )}

          <button type="submit" disabled={submitting || !quote || quote.has_problems} className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-navy-900 text-sm font-semibold text-white shadow-lg shadow-navy-900/20 transition hover:-translate-y-0.5 hover:bg-navy-800 disabled:translate-y-0 disabled:opacity-50">
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
            {submitting ? t.placing : `${t.placeOrder}${total ? ` · ${money(total.grand_total)}` : ""}`}
          </button>
          <p className="mt-3 text-center text-xs text-ink/50">{t.terms}</p>
        </div>
        <Link href={localePath(lang, "/shop")} className="mt-4 flex items-center justify-center gap-1 text-sm text-ink/60 hover:text-navy-900">
          <ChevronLeft className="size-4" /> {t.continueShopping}
        </Link>
      </aside>
    </form>
  );
}


function Row({ label, value, accent = false }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink/65">{label}</dt>
      <dd className={`tabular-nums ${accent ? "text-teal-500" : "text-navy-900"}`}>{value}</dd>
    </div>
  );
}
