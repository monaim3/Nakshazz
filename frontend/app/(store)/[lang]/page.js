import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import FallingPetals from "@/components/store/FallingPetals";
import Hero3D from "@/components/store/Hero3D";
import ProductCard from "@/components/store/ProductCard";
import SectionHeading from "@/components/store/SectionHeading";
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
          <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
            <SectionHeading title={t.categories} />
            <ul className="scrollbar-none -mx-4 flex snap-x gap-6 overflow-x-auto px-4 sm:justify-center sm:gap-10">
              {home.categories.map((category) => (
                <li
                  key={category.id}
                  className="w-28 shrink-0 snap-start sm:w-36"
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
        subtitle={t.featuredSubtitle}
        products={home.featured}
        lang={lang}
        dict={dict}
        href={localePath(lang, "/shop?featured=1")}
        linkLabel={t.viewAll}
        tone="band"
      />

      {home.promo_banners.length > 0 && (
        <section className="mx-auto grid max-w-7xl gap-4 px-4 py-12 sm:px-6 md:grid-cols-2">
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
        subtitle={t.newArrivalsSubtitle}
        products={home.new_arrivals}
        lang={lang}
        dict={dict}
        href={localePath(lang, "/shop?sort=newest")}
        linkLabel={t.viewAll}
      />

      <section className="relative overflow-hidden bg-[linear-gradient(160deg,var(--color-teal-100),var(--color-ivory-100)_70%)]">
        <FallingPetals />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:px-6 md:grid-cols-2 lg:py-16">
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
              {t.storyTitle}
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
        subtitle={t.bestSellersSubtitle}
        products={home.best_sellers}
        lang={lang}
        dict={dict}
        href={localePath(lang, "/shop?sort=popular")}
        linkLabel={t.viewAll}
      />

      {home.reviews.length > 0 && (
        <section className="bg-navy-900 text-ivory-50">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
            <div className="mb-12 text-center">
              <h2 className="font-display text-3xl text-marigold-200 sm:text-4xl">
                {t.reviews}
              </h2>
              <div className="folk-rule mx-auto mt-4 w-24" />
            </div>
            <ul className="grid gap-6 md:grid-cols-3">
              {home.reviews.slice(0, 3).map((review) => (
                <li
                  key={review.id}
                  className="rounded-sm border border-white/10 bg-white/[0.03] p-8 text-center"
                >
                  <div
                    className="flex justify-center gap-1"
                    aria-label={`${review.rating} out of 5`}
                  >
                    {Array.from({ length: 5 }, (_, star) => (
                      <Star
                        key={star}
                        className={`size-4 ${star < review.rating ? "fill-marigold-400 text-marigold-400" : "text-white/20"}`}
                        aria-hidden
                      />
                    ))}
                  </div>
                  <blockquote className="mt-5 font-display text-xl leading-relaxed text-ivory-50 italic">
                    “{review.comment}”
                  </blockquote>
                  <p className="mt-5 text-xs tracking-[0.25em] text-marigold-300 uppercase">
                    {review.customer_name}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {(store.facebook_url || store.instagram_url) && (
        <section className="mx-auto max-w-3xl px-4 py-12 text-center lg:py-16 sm:px-6">
          <h2 className="font-display text-3xl text-navy-900 sm:text-4xl">
            {t.social}
          </h2>
          <p className="mt-3 text-ink/65">{t.socialText}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {store.facebook_url && (
              <a
                href={store.facebook_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-navy-900 px-8 py-3 text-xs font-medium tracking-[0.25em] text-navy-900 uppercase transition-colors hover:bg-navy-900 hover:text-white"
              >
                Facebook
              </a>
            )}
            {store.instagram_url && (
              <a
                href={store.instagram_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-navy-900 px-8 py-3 text-xs font-medium tracking-[0.25em] text-navy-900 uppercase transition-colors hover:bg-navy-900 hover:text-white"
              >
                Instagram
              </a>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function ProductSection({
  title,
  subtitle,
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
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
        <SectionHeading
          title={title}
          subtitle={subtitle}
          href={href}
          linkLabel={linkLabel}
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
          {products.slice(0, 8).map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              lang={lang}
              dict={dict}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
