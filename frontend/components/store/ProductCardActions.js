"use client";

import { useState } from "react";
import { Check, Eye, Plus } from "lucide-react";
import { addToCart, openCartDrawer } from "@/lib/cart-storage";
import FavouriteButton from "./FavouriteButton";
import QuickView from "./QuickView";

/**
 * Interactive layer on a product card: favourite heart and "+" add-to-bag (top right),
 * and a Quick view button that slides up on hover (always visible as an icon on touch screens).
 * "+" adds a single-variant product straight to the bag; with several variants it opens
 * quick view so the shopper can choose. The quick view popup is only mounted once opened.
 */
export default function ProductCardActions({ product, lang, t }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [added, setAdded] = useState(false);

  function showQuickView() {
    setMounted(true);
    setOpen(true);
  }

  function quickAdd(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!product.quick_add) {
      showQuickView();
      return;
    }
    addToCart(product.quick_add.variant_id, 1, product.quick_add.max_quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
    openCartDrawer();
  }

  return (
    <>
      <FavouriteButton product={product} labels={t} className="absolute top-3 right-3 z-10" />
      {product.in_stock && (
        <button
          type="button"
          onClick={quickAdd}
          aria-label={`${t.addToBag}: ${product.name}`}
          title={t.addToBag}
          className={`absolute top-14 right-3 z-10 flex size-9 items-center justify-center rounded-full shadow-sm backdrop-blur transition hover:scale-105 active:scale-95 ${
            added ? "bg-lotus-500 text-white" : "bg-white/90 text-navy-900 hover:bg-white"
          }`}
        >
          {added ? <Check className="size-[45%]" strokeWidth={2.2} /> : <Plus className="size-[50%]" strokeWidth={2} />}
        </button>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          showQuickView();
        }}
        className="absolute right-3 bottom-3 z-10 flex size-9 items-center justify-center gap-2 rounded-full bg-navy-900/90 text-sm font-medium text-white backdrop-blur transition duration-300 hover:bg-navy-900 sm:inset-x-3 sm:h-11 sm:w-auto sm:translate-y-3 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:focus-visible:translate-y-0 sm:focus-visible:opacity-100"
        aria-label={`${t.quickView}: ${product.name}`}
      >
        <Eye className="size-4" />
        <span className="hidden sm:inline">{t.quickView}</span>
      </button>
      {mounted && <QuickView slug={product.slug} open={open} onClose={() => setOpen(false)} lang={lang} t={t} />}
    </>
  );
}
