"use client";

import { Heart } from "lucide-react";
import { toggleWishlist, useIsFavourite } from "@/lib/wishlist-storage";

/** Heart toggle; saves a card snapshot to the browser favourites list. */
export default function FavouriteButton({ product, labels, className = "", size = "md" }) {
  const saved = useIsFavourite(product.slug);
  const box = size === "lg" ? "size-12" : "size-9";

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleWishlist(product);
      }}
      aria-pressed={saved}
      aria-label={saved ? labels.removeFavourite : labels.addFavourite}
      title={saved ? labels.removeFavourite : labels.addFavourite}
      className={`flex ${box} items-center justify-center rounded-full bg-white/90 text-navy-900 shadow-sm backdrop-blur transition hover:scale-105 hover:bg-white active:scale-95 ${className}`}
    >
      <Heart className={`size-[45%] transition ${saved ? "fill-lotus-500 text-lotus-500" : ""}`} strokeWidth={1.8} />
    </button>
  );
}
