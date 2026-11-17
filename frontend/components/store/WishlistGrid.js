"use client";

import Link from "next/link";
import { Heart, X } from "lucide-react";
import { localePath } from "@/lib/i18n";
import { removeFromWishlist, useWishlist } from "@/lib/wishlist-storage";
import ProductCardActions from "./ProductCardActions";
import StoreImage from "./StoreImage";
import Price from "./Price";

/** Favourites saved in this browser, shown as product cards (quick view + remove). */
export default function WishlistGrid({ lang, dict }) {
  const items = useWishlist();
  const t = dict.wishlist;

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-lotus-50 text-lotus-500">
          <Heart className="size-7" strokeWidth={1.6} />
        </span>
        <h2 className="mt-5 font-display text-2xl text-navy-900">{t.empty}</h2>
        <p className="mt-2 text-sm text-ink/65">{t.emptyText}</p>
        <Link href={localePath(lang, "/shop")} className="mt-8 rounded-full bg-navy-900 px-8 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-navy-800">
          {t.browse}
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
      {items.map((product) => {
        const href = localePath(lang, `/product/${product.slug}`);
        return (
          <li key={product.slug} className="group">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-ivory-100">
              <Link href={href} className="block size-full" tabIndex={-1} aria-hidden>
                {product.image && <StoreImage urls={product.image.urls} alt="" sizes="(min-width: 1024px) 22vw, 48vw" className="size-full object-cover transition duration-700 group-hover:scale-[1.05]" />}
              </Link>
              <ProductCardActions product={product} lang={lang} t={dict.product} />
            </div>
            <Link href={href} className="mt-3 block space-y-1 text-center">
              <h3 className="font-display text-lg leading-snug text-ink group-hover:text-lotus-600">{product.name}</h3>
              <Price value={product.price} compareAt={product.compare_at_price} lang={lang} prefix={product.has_price_range ? dict.product.from : null} className="justify-center text-sm" />
            </Link>
            <button type="button" onClick={() => removeFromWishlist(product.slug)} className="mx-auto mt-2 flex items-center gap-1 text-xs text-ink/50 transition hover:text-lotus-600">
              <X className="size-3.5" /> {t.remove}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
