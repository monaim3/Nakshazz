import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight, Gem, ShieldCheck, Star, Truck } from "lucide-react";
import HighlightTitle from "@/components/store/HighlightTitle";
import ProductCard from "@/components/store/ProductCard";
import ProductGallery from "@/components/store/ProductGallery";
import ProductPurchase from "@/components/store/ProductPurchase";
import { formatPrice } from "@/components/store/Price";
import { currentLang, getDictionary } from "@/lib/dictionaries";
import { localePath, localizeDigits } from "@/lib/i18n";
import { getProduct, getProducts, getSettings } from "@/lib/storefront-api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nakshazz.com";

export async function generateStaticParams() {
  const result = await getProducts({ per_page: 48 }).catch(() => null);
  const slugs = result?.data?.map((product) => ({ slug: product.slug })) || [];
  return slugs.length ? slugs : [{ slug: "aqua-agate-drops" }];
}

export async function generateMetadata({ params }) {
  const [{ slug }, lang] = await Promise.all([params, currentLang()]);
  const product = await getProduct(slug);
  if (!product) return {};
  const path = `/product/${product.slug}`;
  const image = product.images?.[0]?.urls?.lg;
  return {
    title: product.seo?.title || product.name,
    description: product.seo?.description || product.short_description || undefined,
    alternates: { canonical: localePath(lang, path), languages: { en: path, bn: `/bn${path}`, "x-default": path } },
    openGraph: { type: "website", title: product.name, description: product.short_description || undefined, images: image ? [{ url: image }] : undefined },
  };
}

export default function ProductPage({ params }) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

async function ProductContent({ params }) {
  const [{ slug }, lang, dict, settings] = await Promise.all([params, currentLang(), getDictionary(), getSettings()]);
  const product = await getProduct(slug);
  if (!product) notFound();

  const t = dict.product;
  const p = dict.productPage;
  const images = product.images?.length ? product.images : product.image ? [product.image] : [];
  const reviews = product.reviews || [];
  const related = (product.related || []).slice(0, 4);
  const zones = settings?.delivery_zones || [];
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : null;

  // Structured data for Google (rich results: price, stock, rating)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.short_description || product.description || undefined,
    image: images.map((image) => image.urls.lg),
    sku: product.variants?.[0]?.sku,
    brand: { "@type": "Brand", name: "Nakshazz" },
    category: product.category?.name,
    offers: product.variants?.map((variant) => ({
      "@type": "Offer",
      url: `${SITE_URL}${localePath(lang, `/product/${product.slug}`)}`,
      priceCurrency: "BDT",
      price: variant.price,
      sku: variant.sku,
      availability: variant.stock_status === "out_of_stock" ? "https://schema.org/OutOfStock" : variant.stock_status === "made_to_order" ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    })),
    ...(average ? { aggregateRating: { "@type": "AggregateRating", ratingValue: average.toFixed(1), reviewCount: reviews.length } } : {}),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      {/* JSON-LD: content is our own API data, serialized; "<" escaped so it cannot close the script tag */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <nav aria-label={dict.shop.breadcrumb} className="flex flex-wrap items-center gap-1 pt-6 pb-6 text-xs text-ink/55">
        <Link href={localePath(lang, "/")} className="relative after:absolute after:-inset-x-1 after:-inset-y-2.5 hover:text-navy-900">
          {dict.shop.home}
        </Link>
        <ChevronRight className="size-3" />
        <Link href={localePath(lang, "/shop")} className="relative after:absolute after:-inset-x-1 after:-inset-y-2.5 hover:text-navy-900">
          {dict.shop.title.replace(/\*/g, "")}
        </Link>
        {product.category && (
          <>
            <ChevronRight className="size-3" />
            <Link href={localePath(lang, `/category/${product.category.slug}`)} className="relative after:absolute after:-inset-x-1 after:-inset-y-2.5 hover:text-navy-900">
              {product.category.name}
            </Link>
          </>
        )}
        <ChevronRight className="size-3" />
        <span aria-current="page" className="text-navy-900">
          {product.name}
        </span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <ProductGallery images={images} name={product.name} productId={product.id} />

        <div>
          {product.category && (
            <Link href={localePath(lang, `/category/${product.category.slug}`)} className="text-xs font-medium tracking-[0.2em] text-marigold-600 uppercase hover:text-lotus-600">
              {product.category.name}
            </Link>
          )}
          <h1 className="mt-2 font-display text-4xl leading-tight text-navy-900 sm:text-5xl">{product.name}</h1>
          {average && (
            <a href="#reviews" className="mt-3 flex items-center gap-2 text-sm text-ink/60">
              <Stars rating={Math.round(average)} />
              {p.reviewsCount.replace(":count", localizeDigits(String(reviews.length), lang))}
            </a>
          )}
          {product.short_description && <p className="mt-4 leading-relaxed text-ink/70">{product.short_description}</p>}

          <div className="mt-6">
            <ProductPurchase product={product} lang={lang} t={t} tryOnT={dict.tryon} />
          </div>

          {/* Promises */}
          <ul className="mt-8 grid gap-3 rounded-3xl bg-ivory-100 p-5 text-sm text-navy-900">
            <li className="flex items-start gap-3">
              <Truck className="mt-0.5 size-5 shrink-0 text-marigold-600" strokeWidth={1.6} />
              <span>
                {p.delivery}
                {zones.length > 0 && (
                  <span className="block text-ink/60">
                    {zones.map((zone) => `${zone.name}: ${formatPrice(zone.charge, lang)}`).join(" · ")}
                  </span>
                )}
              </span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-marigold-600" strokeWidth={1.6} />
              <span>{p.payment}</span>
            </li>
            <li className="flex items-start gap-3">
              <Gem className="mt-0.5 size-5 shrink-0 text-marigold-600" strokeWidth={1.6} />
              <span>{product.preparation_days ? p.madeIn.replace(":days", localizeDigits(String(product.preparation_days), lang)) : p.handmade}</span>
            </li>
          </ul>

          {/* Details */}
          <div className="mt-8 divide-y divide-ivory-200 border-y border-ivory-200">
            {product.description && (
              <details open className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between font-display text-xl text-navy-900">
                  {p.description}
                  <ChevronRight className="size-4 transition group-open:rotate-90" />
                </summary>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink/70">
                  {product.description.split(/\n{2,}/).map((paragraph, i) => (
                    <p key={i} className="whitespace-pre-line">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </details>
            )}
            <details className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-display text-xl text-navy-900">
                {p.careTitle}
                <ChevronRight className="size-4 transition group-open:rotate-90" />
              </summary>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink/70">
                {p.care.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      </div>

      {/* Reviews */}
      <section id="reviews" className="mt-16 scroll-mt-32">
        <h2 className="text-center font-display text-3xl text-navy-900 sm:text-4xl">
          <HighlightTitle text={p.reviewsTitle} />
        </h2>
        {reviews.length === 0 ? (
          <p className="mt-4 text-center text-sm text-ink/60">{p.noReviews}</p>
        ) : (
          <ul className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reviews.slice(0, 6).map((review) => {
              const bangla = /[ঀ-৿]/.test(review.comment);
              return (
                <li key={review.id} className="rounded-2xl border border-ivory-200 bg-white p-6">
                  <Stars rating={review.rating} />
                  <p lang={bangla ? "bn" : undefined} className={`mt-3 leading-relaxed text-ink/80 ${bangla ? "font-bangla" : ""}`}>
                    {review.comment}
                  </p>
                  <p className="mt-4 text-sm font-medium text-navy-900">{review.customer_name}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-8 text-center font-display text-3xl text-navy-900 sm:text-4xl">
            <HighlightTitle text={p.relatedTitle} />
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-5 md:grid-cols-4 lg:gap-x-6">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} lang={lang} dict={dict} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stars({ rating }) {
  return (
    <span className="flex gap-0.5" aria-label={`${rating} / 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`size-4 ${i < rating ? "fill-marigold-400 text-marigold-400" : "text-ink/20"}`} aria-hidden />
      ))}
    </span>
  );
}

function ProductSkeleton() {
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-16 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16" aria-hidden>
      <div className="aspect-[4/5] animate-pulse rounded-3xl bg-ivory-200" />
      <div className="space-y-4">
        <div className="h-4 w-32 animate-pulse rounded bg-ivory-200" />
        <div className="h-12 w-3/4 animate-pulse rounded bg-ivory-200" />
        <div className="h-8 w-24 animate-pulse rounded bg-ivory-200" />
        <div className="h-13 w-full animate-pulse rounded-full bg-ivory-200" />
      </div>
    </div>
  );
}
