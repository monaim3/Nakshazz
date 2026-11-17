import Link from "next/link";
import { localePath } from "@/lib/i18n";
import ProductCardActions from "./ProductCardActions";
import StoreImage from "./StoreImage";
import Price from "./Price";

export default function ProductCard({ product, lang, dict, priority = false }) {
  const onSale = product.compare_at_price && Number(product.compare_at_price) > Number(product.price);
  const badge = !product.in_stock ? dict.product.soldOut : product.is_made_to_order ? dict.product.madeToOrder : onSale ? dict.product.sale : null;
  const href = localePath(lang, `/product/${product.slug}`);

  return (
    <article className="group">
      {/* Image: the link fills it; heart and quick view sit on top, outside the link (no buttons inside <a>) */}
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-ivory-100">
        <Link href={href} className="block size-full" tabIndex={-1} aria-hidden>
          {product.image ? (
            <StoreImage
              urls={product.image.urls}
              alt=""
              sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 48vw"
              priority={priority}
              className="size-full object-cover transition duration-700 ease-out group-hover:scale-[1.05]"
            />
          ) : (
            <div className="flex size-full items-center justify-center font-display text-2xl text-lotus-400">Nakshazz</div>
          )}
        </Link>
        {badge && (
          <span
            className={`pointer-events-none absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.14em] uppercase ${
              onSale && product.in_stock && !product.is_made_to_order ? "bg-lotus-500 text-white" : "bg-white/90 text-navy-700"
            }`}
          >
            {badge}
          </span>
        )}
        <ProductCardActions product={product} lang={lang} t={dict.product} />
      </div>
      <Link href={href} className="mt-3 block space-y-1 text-center">
        <h3 className="font-display text-lg leading-snug text-ink transition-colors group-hover:text-lotus-600">{product.name}</h3>
        <Price value={product.price} compareAt={product.compare_at_price} lang={lang} prefix={product.has_price_range ? dict.product.from : null} className="justify-center text-sm" />
      </Link>
    </article>
  );
}
