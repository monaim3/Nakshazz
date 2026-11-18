"use client";

import { useState } from "react";
import { Check, Minus, Plus, ShoppingBag, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { addToCart, openCartDrawer } from "@/lib/cart-storage";
import { localePath, localizeDigits } from "@/lib/i18n";
import FavouriteButton from "./FavouriteButton";
import Price from "./Price";
import VariantPicker from "./VariantPicker";

/** Price, stock, variant, quantity and the two buy buttons on the product page. */
export default function ProductPurchase({ product, lang, t }) {
  const router = useRouter();
  const preferred = product.variants.find((v) => v.is_default && v.stock_status !== "out_of_stock") || product.variants.find((v) => v.stock_status !== "out_of_stock") || product.variants[0];
  const [variantId, setVariantId] = useState(preferred?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const variant = product.variants.find((v) => v.id === variantId);
  const max = Math.max(1, variant?.max_quantity || 1);
  const soldOut = !variant || variant.stock_status === "out_of_stock";
  const showVariants = product.variants.length > 1 && product.variants.some((v) => v.title || Object.keys(v.options || {}).length);

  const badge = !variant
    ? null
    : variant.stock_status === "out_of_stock"
      ? { text: t.soldOut, tone: "bg-ink/5 text-ink/60" }
      : variant.stock_status === "made_to_order"
        ? { text: t.madeToOrder, tone: "bg-teal-100 text-teal-500" }
        : variant.low_stock_count
          ? { text: t.onlyLeft.replace(":count", localizeDigits(String(variant.low_stock_count), lang)), tone: "bg-marigold-100 text-marigold-700" }
          : { text: t.inStock, tone: "bg-teal-100 text-teal-500" };

  function add(thenCheckout = false) {
    if (soldOut) return;
    addToCart(variant.id, quantity, max);
    if (thenCheckout) {
      router.push(localePath(lang, "/checkout"));
      return;
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
    openCartDrawer();
  }

  return (
    <div>
      <Price value={variant?.price ?? product.price} compareAt={variant?.compare_at_price ?? product.compare_at_price} lang={lang} className="text-2xl" />
      {badge && (
        <span className={`mt-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium tracking-wide uppercase ${badge.tone}`}>
          <span className="size-1.5 rounded-full bg-current" /> {badge.text}
        </span>
      )}

      {showVariants && (
        <VariantPicker
          product={product}
          value={variantId}
          t={t}
          onChange={(id) => {
            setVariantId(id);
            setQuantity(1);
          }}
        />
      )}

      <div className="mt-8 flex items-center gap-3">
        <div className="flex h-13 items-center rounded-full border border-ivory-300 bg-white">
          <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} className="flex size-12 items-center justify-center text-navy-900 disabled:opacity-30" aria-label={t.decrease}>
            <Minus className="size-4" />
          </button>
          <span className="w-8 text-center tabular-nums" aria-live="polite" aria-label={t.quantity}>
            {localizeDigits(String(quantity), lang)}
          </span>
          <button type="button" onClick={() => setQuantity((q) => Math.min(max, q + 1))} disabled={quantity >= max || soldOut} className="flex size-12 items-center justify-center text-navy-900 disabled:opacity-30" aria-label={t.increase}>
            <Plus className="size-4" />
          </button>
        </div>
        <FavouriteButton product={product} labels={t} size="lg" className="size-13 border border-ivory-300 shadow-none" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => add(false)}
          disabled={soldOut}
          className="flex h-13 items-center justify-center gap-2 rounded-full border border-navy-900 bg-white text-sm font-medium text-navy-900 transition hover:bg-navy-900 hover:text-white disabled:border-ink/20 disabled:text-ink/40 disabled:hover:bg-white"
        >
          {added ? <Check className="size-4" /> : <ShoppingBag className="size-4" />}
          {soldOut ? t.soldOut : added ? t.added : t.addToBag}
        </button>
        <button
          type="button"
          onClick={() => add(true)}
          disabled={soldOut}
          className="flex h-13 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-gold-light),var(--color-saffron))] text-sm font-semibold text-navy-950 shadow-[0_10px_25px_-10px_rgba(229,147,42,0.7)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
        >
          <Zap className="size-4" /> {t.buyNow}
        </button>
      </div>
    </div>
  );
}
