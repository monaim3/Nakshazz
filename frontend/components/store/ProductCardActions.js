"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import FavouriteButton from "./FavouriteButton";
import QuickView from "./QuickView";

/**
 * Interactive layer on a product card: favourite heart (top right) and a Quick view
 * button that slides up on hover (always visible as an icon on touch screens).
 * The quick view popup is only mounted once it has been opened.
 */
export default function ProductCardActions({ product, lang, t }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  return (
    <>
      <FavouriteButton product={product} labels={t} className="absolute top-3 right-3 z-10" />
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          setMounted(true);
          setOpen(true);
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
