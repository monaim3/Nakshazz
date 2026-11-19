"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Loader2, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { onCartDrawerOpen, removeFromCart, setCartQuantity, useCart } from "@/lib/cart-storage";
import { localePath, localizeDigits } from "@/lib/i18n";
import { formatPrice } from "./Price";

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * Bag drawer (right side). Mounted once in the store layout; opens from the header bag icon
 * or after "Add to bag". Lines are re-priced by POST /cart/validate on every change, so
 * prices, stock and totals always come from the server, never from the browser.
 */
export default function CartDrawer({ lang, t }) {
  const dialogRef = useRef(null);
  const lines = useCart();
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => onCartDrawerOpen(() => setOpen(true)), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    document.documentElement.style.overflow = open ? "hidden" : "";
  }, [open]);

  // Re-quote whenever the drawer is open and the lines change (small debounce for +/- taps).
  useEffect(() => {
    if (!open || lines.length === 0) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`${API}/cart/validate`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: lines.map((line) => ({ variant_id: line.variantId, quantity: line.quantity })) }),
      })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then(({ data }) => {
          setQuote(data);
          setFailed(false);
          // stock is lower than requested: bring the bag down to what is available
          data.lines.filter((line) => line.problem === "insufficient_stock" && line.quantity > 0).forEach((line) => setCartQuantity(line.variant_id, line.quantity));
        })
        .catch((reason) => reason.name !== "AbortError" && setFailed(true))
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, lines]);

  const empty = lines.length === 0;
  const quoted = quote?.lines || [];
  const byId = new Map(quoted.map((line) => [line.variant_id, line]));
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const n = (value) => localizeDigits(String(value), lang);
  const problemText = { unavailable: t.unavailable, out_of_stock: t.outOfStock, insufficient_stock: t.limitedStock };

  return (
    <dialog
      ref={dialogRef}
      onClose={() => setOpen(false)}
      onClick={(event) => event.target === dialogRef.current && setOpen(false)}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-md bg-transparent p-0 backdrop:bg-navy-950/50 backdrop:backdrop-blur-[2px] open:animate-[drawer-in_0.35s_cubic-bezier(.2,.8,.25,1)]"
      aria-label={t.title}
    >
      <div className="flex h-full flex-col bg-ivory-50 text-ink shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ivory-200 px-6 py-5">
          <h2 className="font-display text-2xl text-navy-900">
            {t.title} {count > 0 && <span className="text-base text-ink/50">({n(count)})</span>}
          </h2>
          <button type="button" onClick={() => setOpen(false)} className="flex size-10 items-center justify-center rounded-full text-navy-900 transition hover:rotate-90 hover:bg-ivory-200" aria-label={t.close}>
            <X className="size-5" />
          </button>
        </div>

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-ivory-200 text-navy-900">
              <ShoppingBag className="size-7" strokeWidth={1.5} />
            </span>
            <p className="mt-5 font-display text-2xl text-navy-900">{t.empty}</p>
            <p className="mt-2 text-sm text-ink/60">{t.emptyText}</p>
            <Link href={localePath(lang, "/shop")} onClick={() => setOpen(false)} className="mt-8 rounded-full bg-navy-900 px-8 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5">
              {t.continue}
            </Link>
          </div>
        ) : (
          <>
            {/* Lines */}
            <ul className="flex-1 divide-y divide-ivory-200 overflow-y-auto px-6">
              {lines.map((line) => {
                const info = byId.get(line.variantId);
                const problem = info?.problem;
                const href = info?.product_slug ? localePath(lang, `/product/${info.product_slug}`) : null;
                return (
                  <li key={line.variantId} className="flex gap-4 py-5">
                    <div className="size-24 shrink-0 overflow-hidden rounded-xl bg-ivory-200">
                      {info?.image && (
                        // eslint-disable-next-line @next/next/no-img-element -- optimised WebP from the API
                        <img src={info.image.urls.sm} alt="" className="size-full object-cover" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {href ? (
                            <Link href={href} onClick={() => setOpen(false)} className="font-display text-xl leading-snug font-semibold text-navy-900 hover:text-lotus-600">
                              {info.product_name}
                            </Link>
                          ) : (
                            <p className="h-5 w-32 animate-pulse rounded bg-ivory-200" />
                          )}
                          {info?.variant_title && <p className="mt-0.5 text-xs font-medium text-ink/65">{info.variant_title}</p>}
                        </div>
                        <button type="button" onClick={() => removeFromCart(line.variantId)} className="rounded-full p-1.5 text-ink/40 transition hover:bg-lotus-50 hover:text-lotus-600" aria-label={t.remove}>
                          <Trash2 className="size-4" />
                        </button>
                      </div>

                      {problem && (
                        <p className="mt-1.5 flex items-center gap-1 text-xs text-lotus-600">
                          <AlertCircle className="size-3.5 shrink-0" />
                          {problem === "insufficient_stock" ? t.limitedStock.replace(":count", n(info.quantity)) : problemText[problem]}
                        </p>
                      )}

                      <div className="mt-auto flex items-center justify-between pt-3">
                        {problem === "unavailable" || problem === "out_of_stock" ? (
                          <span />
                        ) : (
                          <div className="flex h-9 items-center rounded-full border border-ivory-300">
                            <button type="button" onClick={() => setCartQuantity(line.variantId, line.quantity - 1)} disabled={line.quantity <= 1} className="flex size-9 items-center justify-center text-navy-900 disabled:opacity-30" aria-label={t.decrease}>
                              <Minus className="size-3.5" />
                            </button>
                            <span className="w-6 text-center text-sm tabular-nums">{n(line.quantity)}</span>
                            <button
                              type="button"
                              onClick={() => setCartQuantity(line.variantId, line.quantity + 1)}
                              disabled={problem === "insufficient_stock"}
                              className="flex size-9 items-center justify-center text-navy-900 disabled:opacity-30"
                              aria-label={t.increase}
                            >
                              <Plus className="size-3.5" />
                            </button>
                          </div>
                        )}
                        <span className="font-medium text-navy-900 tabular-nums">{info?.line_subtotal ? formatPrice(info.line_subtotal, lang) : "—"}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Summary */}
            <div className="border-t border-ivory-200 bg-white px-6 pt-5 pb-6">
              {failed && <p className="mb-3 text-xs text-lotus-600">{t.loadError}</p>}
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink/70">{t.subtotal}</span>
                <span className="flex items-center gap-2 text-xl font-semibold text-navy-900 tabular-nums">
                  {loading && <Loader2 className="size-4 animate-spin text-ink/40" />}
                  {quote ? formatPrice(quote.totals.items_subtotal, lang) : "—"}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink/55">{t.deliveryNote}</p>
              <Link
                href={localePath(lang, "/checkout")}
                onClick={() => setOpen(false)}
                aria-disabled={!quote || quote.has_problems}
                className={`group mt-5 flex h-13 items-center justify-center gap-2 rounded-full bg-navy-900 text-sm font-medium text-white shadow-lg shadow-navy-900/20 transition hover:-translate-y-0.5 hover:bg-navy-800 ${
                  !quote || quote.has_problems ? "pointer-events-none opacity-40" : ""
                }`}
              >
                {t.checkout} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </Link>
              {quote?.has_problems && <p className="mt-2 text-center text-xs text-lotus-600">{t.fixProblems}</p>}
              <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full text-center text-sm text-ink/60 underline-offset-4 hover:text-navy-900 hover:underline">
                {t.continue}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
