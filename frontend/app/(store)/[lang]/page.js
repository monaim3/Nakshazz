import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import FallingPetals from "@/components/store/FallingPetals";
import Hero3D from "@/components/store/Hero3D";
import ProductCard from "@/components/store/ProductCard";
import HighlightTitle from "@/components/store/HighlightTitle";
import SectionHeading from "@/components/store/SectionHeading";
import ViewAllButton from "@/components/store/ViewAllButton";
import ReviewsCarousel from "@/components/store/ReviewsCarousel";
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
        <section className="relative overflow-hidden bg-navy-950 text-ivory-50">
          {/* soft lotus glow + faint grid, like a stage behind the cards */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_50%_60%,rgba(209,30,88,0.28),transparent_70%)]" aria-hidden />
          <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px]" aria-hidden />
          <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
            <div className="mb-8 text-center">
              <p className="text-xs font-medium tracking-[0.3em] text-lotus-400 uppercase">{t.reviewsEyebrow}</p>
              <h2 className="mt-3 font-display text-4xl text-white sm:text-5xl">
                <HighlightTitle text={t.reviews} tone="dark" />
              </h2>
            </div>
            <ReviewsCarousel reviews={home.reviews} t={t} />
            {(store.facebook_url || store.whatsapp_number) && (
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                {store.facebook_url && (
                  <a href={`${store.facebook_url.replace(/\/$/, "")}/reviews`} target="_blank" rel="noreferrer" className="rounded-full border border-white/25 px-6 py-3 text-sm font-medium text-white transition hover:border-white hover:bg-white/10">
                    {t.reviewsAll}
                  </a>
                )}
                {store.facebook_url && (
                  <a href={`${store.facebook_url.replace(/\/$/, "")}/reviews`} target="_blank" rel="noreferrer" className="group flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-gold-light),var(--color-saffron))] px-6 py-3 text-sm font-semibold text-navy-950 shadow-[0_10px_30px_-10px_rgba(229,147,42,0.7)] transition hover:-translate-y-0.5">
                    {t.reviewsWrite} <span className="transition group-hover:translate-x-1">→</span>
                  </a>
                )}
              </div>
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
