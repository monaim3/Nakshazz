import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { localePath, localizeDigits } from "@/lib/i18n";
import { getProducts } from "@/lib/storefront-api";
import CatalogToolbar from "./CatalogToolbar";
import ProductCard from "./ProductCard";

const PER_PAGE = 12;
const KEYS = ["q", "sort", "min_price", "max_price", "in_stock", "featured", "page"];

/** Only known, sane filter values reach the API (anything else is dropped). */
function cleanQuery(raw) {
  const query = {};
  for (const key of KEYS) {
    const value = Array.isArray(raw[key]) ? raw[key][0] : raw[key];
    if (value === undefined || value === "") continue;
    if (["min_price", "max_price", "page"].includes(key) && !/^\d{1,7}$/.test(value)) continue;
    if (["in_stock", "featured"].includes(key)) {
      if (value === "1" || value === "true") query[key] = 1;
      continue;
    }
    if (key === "sort" && !["newest", "popular", "price", "-price", "name"].includes(value)) continue;
    query[key] = String(value).slice(0, 100);
  }
  if (query.min_price && query.max_price && Number(query.min_price) > Number(query.max_price)) delete query.max_price;
  return query;
}

/**
 * Product grid with search, sort, price and stock filters and pagination.
 * Renders inside <Suspense>: it reads searchParams, which are only known at request time.
 */
export default async function CatalogView({ searchParams, category = null, lang, dict, basePath }) {
  const query = cleanQuery(await searchParams);
  const result = await getProducts({ ...query, category: category?.slug, per_page: PER_PAGE }).catch(() => null);
  const t = dict.shop;

  if (!result) {
    return <p className="py-20 text-center text-ink/60">{t.loadError}</p>;
  }

  const { data: products, meta } = result;
  const pageHref = (page) => {
    const params = new URLSearchParams(Object.entries({ ...query, page: page > 1 ? page : undefined }).filter(([, v]) => v !== undefined));
    const qs = params.toString();
    return localePath(lang, qs ? `${basePath}?${qs}` : basePath);
  };

  return (
    <div className="lg:grid lg:grid-cols-[230px_1fr] lg:gap-x-10">
      <CatalogToolbar query={query} total={meta.total} lang={lang} t={t} />

      <div className="pt-6 lg:col-start-2 lg:row-start-2">
        {products.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <SearchX className="size-10 text-ink/30" strokeWidth={1.5} />
            <p className="mt-4 font-display text-2xl text-navy-900">{t.empty}</p>
            <p className="mt-1 text-sm text-ink/60">{t.emptyText}</p>
            <Link href={localePath(lang, "/shop")} className="mt-6 rounded-full border border-navy-900 px-6 py-2.5 text-sm text-navy-900 transition hover:bg-navy-900 hover:text-white">
              {t.viewEverything}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} lang={lang} dict={dict} priority={index < 4} />
            ))}
          </div>
        )}

        {meta.last_page > 1 && (
          <nav className="mt-14 flex items-center justify-center gap-2" aria-label={t.pagination}>
            {meta.current_page > 1 && (
              <Link href={pageHref(meta.current_page - 1)} className="flex size-10 items-center justify-center rounded-full border border-ivory-300 text-navy-900 hover:border-navy-900" aria-label={t.previous}>
                <ChevronLeft className="size-4" />
              </Link>
            )}
            {Array.from({ length: meta.last_page }, (_, i) => i + 1)
              .filter((page) => page === 1 || page === meta.last_page || Math.abs(page - meta.current_page) <= 1)
              .map((page, i, pages) => (
                <span key={page} className="flex items-center gap-2">
                  {i > 0 && page - pages[i - 1] > 1 && <span className="text-ink/40">…</span>}
                  <Link
                    href={pageHref(page)}
                    aria-current={page === meta.current_page ? "page" : undefined}
                    className={`flex size-10 items-center justify-center rounded-full text-sm transition ${page === meta.current_page ? "bg-navy-900 text-white" : "border border-ivory-300 text-navy-900 hover:border-navy-900"}`}
                  >
                    {localizeDigits(String(page), lang)}
                  </Link>
                </span>
              ))}
            {meta.current_page < meta.last_page && (
              <Link href={pageHref(meta.current_page + 1)} className="flex size-10 items-center justify-center rounded-full border border-ivory-300 text-navy-900 hover:border-navy-900" aria-label={t.next}>
                <ChevronRight className="size-4" />
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}

export function CatalogSkeleton() {
  return (
    <div className="lg:grid lg:grid-cols-[230px_1fr] lg:gap-x-10" aria-hidden>
      <div className="hidden space-y-4 lg:block">
        <div className="h-11 animate-pulse rounded-full bg-ivory-200" />
        <div className="h-11 animate-pulse rounded-full bg-ivory-200" />
      </div>
      <div>
        <div className="h-12 animate-pulse rounded bg-ivory-100" />
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i}>
              <div className="aspect-[4/5] animate-pulse rounded-2xl bg-ivory-200" />
              <div className="mx-auto mt-3 h-4 w-2/3 animate-pulse rounded bg-ivory-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
