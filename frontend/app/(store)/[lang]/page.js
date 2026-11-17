import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import FallingPetals from "@/components/store/FallingPetals";
import Hero3D from "@/components/store/Hero3D";
import ProductCard from "@/components/store/ProductCard";
import HighlightTitle from "@/components/store/HighlightTitle";
import SectionHeading from "@/components/store/SectionHeading";
import ViewAllButton from "@/components/store/ViewAllButton";
import SocialSection from "@/components/store/SocialSection";
import { currentLang, getDictionary } from "@/lib/dictionaries";
import { getHome, getSettings } from "@/lib/storefront-api";
import { localePath } from "@/lib/i18n";
import badge from "@/public/brand/logo-badge-600.png";

export async function generateMetadata() {
  const lang = await currentLang();
  return {
    alternates: {
      canonical: localePath(lang, "/"),
      languages: { en: "/", bn: "/bn", "x-default": "/" },
    },
  };
}

export default async function HomePage() {
  const [lang, dict, home, settings] = await Promise.all([
    currentLang(),
    getDictionary(),
    getHome(),
    getSettings(),
  ]);
  const store = settings?.store || {};
  const t = dict.home;

  return (
    <>
      <Hero3D t={t} lang={lang} />

      {home.categories.length > 0 && (
        <section className="relative overflow-hidden">
          <FallingPetals />
          <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
            <SectionHeading title={t.categories} />
            <ul className="scrollbar-none -mx-4 flex snap-x gap-5 overflow-x-auto px-4 sm:gap-6 lg:gap-10 [&>li:first-child]:ml-auto [&>li:last-child]:mr-auto">
              {home.categories.map((category) => (
                <li
                  key={category.id}
                  className="w-24 shrink-0 snap-start sm:w-28 lg:w-36"
                >
                  <Link
                    href={localePath(lang, `/category/${category.slug}`)}
                    className="group block text-center"
                  >
                    <span className="block aspect-square overflow-hidden rounded-full border border-marigold-300 bg-ivory-100 p-1.5 transition group-hover:border-marigold-600">
                      {category.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- optimised WebP from the API
                        <img
                          src={category.image_url}
                          alt=""
                          loading="lazy"
                          className="size-full rounded-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center rounded-full bg-ivory-200 font-display text-3xl text-navy-700">
                          {category.name.charAt(0)}
                        </span>
                      )}
                    </span>
                    <span className="mt-3 block font-display text-lg text-navy-900">
                      {category.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <ProductSection
        title={t.featured}
        products={home.featured}
        lang={lang}
        dict={dict}
        href={localePath(lang, "/shop?featured=1")}
        linkLabel={t.viewAll}
        tone="band"
      />

      {home.promo_banners.length > 0 && (
        <section className="mx-auto grid max-w-7xl gap-4 px-4 py-8 lg:py-10 sm:px-6 md:grid-cols-2">
          {home.promo_banners.slice(0, 2).map((banner) => (
            <Link
              key={banner.id}
              href={
                banner.link_url
                  ? localePath(lang, banner.link_url)
                  : localePath(lang, "/shop")
              }
              className="group relative block aspect-[4/3] overflow-hidden rounded-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- optimised WebP from the API */}
              <img
                src={banner.image_url}
                alt=""
                loading="lazy"
                className="size-full object-cover transition duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-900/60 via-navy-900/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-8 text-center text-white">
                {banner.subtitle && (
                  <p className="text-xs tracking-[0.3em] uppercase">
                    {banner.subtitle}
                  </p>
                )}
                <p className="mt-1 font-display text-3xl">{banner.title}</p>
                <span className="mt-4 inline-block border-b border-marigold-300 pb-0.5 text-xs tracking-[0.25em] uppercase">
                  {banner.button_text || t.explore}
                </span>
              </div>
            </Link>
          ))}
        </section>
      )}

      <ProductSection
        title={t.newArrivals}
        products={home.new_arrivals}
        lang={lang}
        dict={dict}
        href={localePath(lang, "/shop?sort=newest")}
        linkLabel={t.viewAll}
      />

      <section className="relative overflow-hidden bg-[linear-gradient(160deg,var(--color-teal-100),var(--color-ivory-100)_70%)]">
        <FallingPetals />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-8 sm:px-6 md:grid-cols-2 lg:py-10">
          <div className="relative mx-auto w-full max-w-md">
            <div
              className="absolute inset-6 rounded-full bg-marigold-200/50 blur-3xl"
              aria-hidden
            />
            <Image
              src={badge}
              alt={dict.brand.logoAlt}
              className="relative h-auto w-full drop-shadow-xl"
              sizes="(min-width: 768px) 28rem, 80vw"
            />
          </div>
          <div className="text-center md:text-left">
            <p className="text-xs font-medium tracking-[0.3em] text-lotus-500 uppercase">
              {t.storyEyebrow}
            </p>
            <h2 className="mt-3 font-display text-4xl leading-tight text-navy-900 sm:text-5xl">
              <HighlightTitle text={t.storyTitle} />
            </h2>
            <div className="folk-rule mx-auto my-6 w-32 md:mx-0" />
            <p className="leading-relaxed text-ink/75">{t.storyText}</p>
            <Link
              href={localePath(lang, "/about")}
              className="mt-8 inline-block rounded-full bg-navy-900 px-9 py-3.5 text-xs font-medium tracking-[0.25em] text-white uppercase transition hover:-translate-y-0.5 hover:bg-lotus-500"
            >
              {t.storyCta}
            </Link>
          </div>
        </div>
      </section>

      <ProductSection
        title={t.bestSellers}
        products={home.best_sellers}
        lang={lang}
        dict={dict}
        href={localePath(lang, "/shop?sort=popular")}
        linkLabel={t.viewAll}
      />

      {home.reviews.length > 0 && (
        <section className="bg-navy-900 text-ivory-50">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
            <div className="mb-8 text-center">
              <h2 className="font-display text-3xl text-marigold-200 sm:text-4xl">
                <HighlightTitle text={t.reviews} tone="dark" />
              </h2>
              <div className="folk-rule mx-auto mt-4 w-24" />
            </div>
            <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
              {home.reviews.map((review) => {
                // Bangla text: no italics (breaks conjuncts) and a Bangla-capable font
                const bangla = /[ঀ-৿]/.test(review.comment);
                return (
                  <li key={review.id} className="flex w-[85%] shrink-0 snap-center flex-col sm:w-[46%] rounded-2xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-sm transition hover:border-gold-light/30 hover:bg-white/[0.06] lg:w-auto">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1" aria-label={`${review.rating} / 5`}>
                        {Array.from({ length: 5 }, (_, star) => (
                          <Star key={star} className={`size-4 ${star < review.rating ? "fill-marigold-400 text-marigold-400" : "text-white/20"}`} aria-hidden />
                        ))}
                      </div>
                      <span className="font-display text-5xl leading-none text-gold-light/25" aria-hidden>
                        &rdquo;
                      </span>
                    </div>
                    <blockquote lang={bangla ? "bn" : undefined} className={`mt-3 flex-1 leading-relaxed text-ivory-50 ${bangla ? "font-bangla text-[17px]" : "font-display text-xl italic"}`}>
                      {review.comment}
                    </blockquote>
                    <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5">
                      <span className="flex size-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-gold-light),var(--color-saffron))] font-display text-lg text-navy-950">
                        {review.customer_name.charAt(0)}
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-white">{review.customer_name}</span>
                        {review.source === "facebook" && <span className="block text-xs text-white/50">{t.reviewsSource}</span>}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {store.facebook_url && (
              <p className="mt-10 text-center">
                <a href={`${store.facebook_url.replace(/\/$/, "")}/reviews`} target="_blank" rel="noreferrer" className="text-sm text-gold-light underline-offset-4 hover:underline">
                  {t.reviewsAll} →
                </a>
              </p>
            )}
          </div>
        </section>
      )}

      {(store.facebook_url || store.instagram_url) && (
        <SocialSection store={store} products={[...home.new_arrivals, ...home.featured, ...home.best_sellers].filter((product, index, all) => all.findIndex((p) => p.id === product.id) === index)} t={t} lang={lang} />
      )}
    </>
  );
}

function ProductSection({
  title,
  products,
  lang,
  dict,
  href,
  linkLabel,
  tone,
}) {
  if (!products?.length) return null;

  return (
    <section className={tone === "band" ? "bg-white/60" : undefined}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
        <SectionHeading title={title} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-5 md:grid-cols-4 lg:gap-x-6">
          {products.slice(0, 8).map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              lang={lang}
              dict={dict}
            />
          ))}
        </div>
        {href && <ViewAllButton href={href}>{linkLabel}</ViewAllButton>}
      </div>
    </section>
  );
}
