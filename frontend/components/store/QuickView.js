"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { addToCart, openCartDrawer } from "@/lib/cart-storage";
import { localePath, localizeDigits } from "@/lib/i18n";
import FavouriteButton from "./FavouriteButton";
import Price from "./Price";
import VariantPicker from "./VariantPicker";

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * Quick view popup (native <dialog>: focus trap, Esc to close, backdrop click closes).
 * Loads the full product (variants, stock, images) from the public API when opened.
 */
export default function QuickView({ slug, open, onClose, lang, t }) {
  const dialogRef = useRef(null);
  const [product, setProduct] = useState(null);
  const [error, setError] = useState(false);
  const [variantId, setVariantId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.style.overflow = "hidden";
    }
    if (!open && dialog.open) dialog.close();
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open || product?.slug === slug) return undefined;
    const controller = new AbortController();
    fetch(`${API}/products/${encodeURIComponent(slug)}`, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then(({ data }) => {
        setProduct(data);
        const preferred = data.variants.find((v) => v.is_default && v.stock_status !== "out_of_stock") || data.variants.find((v) => v.stock_status !== "out_of_stock") || data.variants[0];
        setVariantId(preferred?.id ?? null);
        setError(false);
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [open, slug, product?.slug]);

  const variant = product?.variants.find((v) => v.id === variantId);
  const images = product?.images?.length ? product.images : product?.image ? [product.image] : [];
  const image = images[Math.min(imageIndex, images.length - 1)];
  const max = Math.max(1, variant?.max_quantity || 1);
  const soldOut = !variant || variant.stock_status === "out_of_stock";
  const showVariants = Boolean(product?.variants.some((v) => Object.keys(v.options || {}).length));

  const stockBadge = !variant
    ? null
    : variant.stock_status === "out_of_stock"
      ? { text: t.soldOut, tone: "bg-ink/5 text-ink/60" }
      : variant.stock_status === "made_to_order"
        ? { text: t.madeToOrder, tone: "bg-teal-100 text-teal-500" }
        : variant.low_stock_count
          ? { text: t.onlyLeft.replace(":count", localizeDigits(String(variant.low_stock_count), lang)), tone: "bg-marigold-100 text-marigold-700" }
          : { text: t.inStock, tone: "bg-teal-100 text-teal-500" };

  function handleAdd() {
    if (!variant || soldOut) return;
    addToCart(variant.id, quantity, max);
    // show the bag right away (popular pattern); the quick view closes behind it
    setTimeout(() => {
      onClose();
      openCartDrawer();
    }, 500);
    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => event.target === dialogRef.current && onClose()}
      className="m-auto w-[min(960px,calc(100vw-24px))] max-w-none overflow-hidden rounded-3xl bg-white p-0 text-ink shadow-2xl backdrop:bg-navy-950/60 backdrop:backdrop-blur-sm open:animate-fade-in"
      aria-label={product?.name || t.quickView}
    >
      <button type="button" onClick={onClose} className="absolute top-4 right-4 z-10 flex size-10 items-center justify-center rounded-full bg-white text-navy-900 shadow-md transition hover:rotate-90" aria-label={t.close}>
        <X className="size-5" />
      </button>

      {!product && !error && (
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-marigold-600" />
        </div>
      )}
      {error && <p className="p-12 text-center text-ink/70">{t.loadError}</p>}

      {product && (
        <div className="grid max-h-[calc(100svh-24px)] overflow-y-auto md:grid-cols-[1.05fr_1fr] md:overflow-hidden">
          {/* Gallery */}
          <div className="relative bg-ivory-100 md:h-[min(640px,calc(100svh-24px))]">
            {image && (
              // eslint-disable-next-line @next/next/no-img-element -- optimised WebP from the API
              <img key={image.id} src={image.urls.lg} srcSet={`${image.urls.md} 800w, ${image.urls.lg} 1600w`} sizes="(min-width: 768px) 500px, 100vw" alt={image.alt || product.name} className="aspect-[4/5] w-full animate-fade-in object-cover md:aspect-auto md:h-full" />
            )}
            {images.length > 1 && (
              <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
                {images.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setImageIndex(index)}
                    aria-label={`${index + 1} / ${images.length}`}
                    aria-current={index === imageIndex}
                    className={`size-12 overflow-hidden rounded-xl border-2 transition ${index === imageIndex ? "border-white shadow-lg" : "border-transparent opacity-70 hover:opacity-100"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail */}
                    <img src={item.urls.sm} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col p-6 sm:p-10 md:overflow-y-auto">
            {product.category && <p className="text-xs font-medium tracking-[0.2em] text-marigold-600 uppercase">{product.category.name}</p>}
            <h2 className="mt-2 pr-10 font-display text-3xl leading-tight text-navy-900 sm:text-4xl">{product.name}</h2>
            <Price value={variant?.price ?? product.price} compareAt={variant?.compare_at_price ?? product.compare_at_price} lang={lang} className="mt-4 text-2xl" />
            {stockBadge && (
              <span className={`mt-4 inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium tracking-wide uppercase ${stockBadge.tone}`}>
                <span className="size-1.5 rounded-full bg-current" /> {stockBadge.text}
              </span>
            )}
            {product.short_description && <p className="mt-5 text-sm leading-relaxed text-ink/70">{product.short_description}</p>}

            {showVariants && (
              <VariantPicker
                product={product}
                value={variantId}
                t={t}
                onChange={(id) => {
                  setVariantId(id);
                  setQuantity(1);
                  // jump to the variant's own photo if it has one
                  const photo = images.findIndex((item) => item.variant_id === id);
                  setImageIndex(photo >= 0 ? photo : Math.max(0, images.findIndex((item) => !item.variant_id)));
                }}
              />
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <div className="flex h-12 items-center rounded-full border border-ivory-300">
                <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} className="flex size-12 items-center justify-center text-navy-900 disabled:opacity-30" aria-label={t.decrease}>
                  <Minus className="size-4" />
                </button>
                <span className="w-8 text-center tabular-nums" aria-live="polite" aria-label={t.quantity}>
                  {localizeDigits(String(quantity), lang)}
                </span>
                <button type="button" onClick={() => setQuantity((q) => Math.min(max, q + 1))} disabled={quantity >= max} className="flex size-12 items-center justify-center text-navy-900 disabled:opacity-30" aria-label={t.increase}>
                  <Plus className="size-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleAdd}
                disabled={soldOut}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-navy-900 px-6 text-sm font-medium text-white shadow-lg shadow-navy-900/20 transition hover:-translate-y-0.5 hover:bg-navy-800 disabled:translate-y-0 disabled:bg-ink/20 disabled:shadow-none"
              >
                {added ? <Check className="size-4 text-gold-light" /> : <ShoppingBag className="size-4" />}
                {soldOut ? t.soldOut : added ? t.added : t.addToBag}
              </button>
              <FavouriteButton product={product} labels={t} size="lg" className="border border-ivory-300 shadow-none" />
            </div>

            <Link href={localePath(lang, `/product/${product.slug}`)} onClick={onClose} className="group mt-6 inline-flex w-fit items-center gap-2 text-sm font-medium text-lotus-600">
              {t.viewDetails} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      )}
    </dialog>
  );
}
