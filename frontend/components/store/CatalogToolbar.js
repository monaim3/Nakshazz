"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { localizeDigits } from "@/lib/i18n";

const SORTS = ["newest", "popular", "price", "-price", "name"];

/**
 * Search, sort and filters for the shop and category pages. Everything lives in the URL
 * (shareable, back button works, crawlable); changing a control navigates to the new URL
 * and the server re-renders the product grid.
 */
export default function CatalogToolbar({ query, total, lang, t }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(query.q || "");
  const [minPrice, setMinPrice] = useState(query.min_price || "");
  const [maxPrice, setMaxPrice] = useState(query.max_price || "");

  function apply(changes) {
    const next = new URLSearchParams();
    const merged = { ...query, ...changes, page: undefined };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== null && value !== "" && value !== false) next.set(key, String(value));
    }
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const activeFilters = [query.q, query.min_price, query.max_price, query.in_stock].filter(Boolean).length;
  const count = localizeDigits(String(total), lang);

  const filters = (
    <div className="space-y-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply({ q: search.trim() });
          setOpen(false);
        }}
      >
        <label className="text-xs font-medium tracking-[0.18em] text-navy-900 uppercase" htmlFor="catalog-search">
          {t.search}
        </label>
        <div className="mt-2 flex h-11 items-center gap-2 rounded-full border border-ivory-300 bg-white px-4 focus-within:border-navy-900">
          <Search className="size-4 text-ink/40" />
          <input id="catalog-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchPlaceholder} maxLength={100} className="w-full bg-transparent text-sm outline-none" />
        </div>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply({ min_price: minPrice, max_price: maxPrice });
          setOpen(false);
        }}
      >
        <p className="text-xs font-medium tracking-[0.18em] text-navy-900 uppercase">{t.price}</p>
        <div className="mt-2 flex items-center gap-2">
          <input type="number" min="0" inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder={t.min} aria-label={t.min} className="h-11 w-full rounded-full border border-ivory-300 bg-white px-4 text-sm outline-none focus:border-navy-900" />
          <span className="text-ink/40">–</span>
          <input type="number" min="0" inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder={t.max} aria-label={t.max} className="h-11 w-full rounded-full border border-ivory-300 bg-white px-4 text-sm outline-none focus:border-navy-900" />
          <button type="submit" className="h-11 shrink-0 rounded-full bg-navy-900 px-4 text-sm font-medium text-white">
            {t.go}
          </button>
        </div>
      </form>

      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="text-sm text-navy-900">{t.inStockOnly}</span>
        <input type="checkbox" checked={Boolean(query.in_stock)} onChange={(event) => apply({ in_stock: event.target.checked ? 1 : undefined })} className="peer sr-only" />
        <span className="relative h-6 w-11 rounded-full bg-ivory-300 transition peer-checked:bg-navy-900 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-marigold-400" aria-hidden />
      </label>

      {activeFilters > 0 && (
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setMinPrice("");
            setMaxPrice("");
            apply({ q: undefined, min_price: undefined, max_price: undefined, in_stock: undefined });
            setOpen(false);
          }}
          className="text-sm text-lotus-600 underline-offset-4 hover:underline"
        >
          {t.clearFilters}
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-ivory-200 py-3 lg:col-start-2 lg:row-start-1">
        <p className="flex items-center gap-2 text-sm text-ink/60" aria-live="polite">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t.results.replace(":count", count)}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpen(true)} className="relative flex h-10 items-center gap-2 rounded-full border border-ivory-300 px-4 text-sm text-navy-900 transition hover:border-navy-900 lg:hidden">
            <SlidersHorizontal className="size-4" /> {t.filters}
            {activeFilters > 0 && <span className="flex size-5 items-center justify-center rounded-full bg-lotus-500 text-[10px] text-white">{localizeDigits(String(activeFilters), lang)}</span>}
          </button>
          <label className="sr-only" htmlFor="catalog-sort">
            {t.sortBy}
          </label>
          <select id="catalog-sort" value={query.sort || "newest"} onChange={(event) => apply({ sort: event.target.value === "newest" ? undefined : event.target.value })} className="h-10 rounded-full border border-ivory-300 bg-white px-4 text-sm text-navy-900 outline-none hover:border-navy-900">
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t.sorts[sort]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Desktop: sticky sidebar (left column of the catalog grid) */}
      <aside className="hidden lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:block">
        <div className="sticky top-40">
          {filters}
        </div>
      </aside>

      {/* Mobile: bottom sheet */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t.filters}>
          <button type="button" className="absolute inset-0 bg-navy-950/50" onClick={() => setOpen(false)} aria-label={t.close} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] animate-fade-in overflow-y-auto rounded-t-3xl bg-ivory-50 p-6 pb-10">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-display text-2xl text-navy-900">{t.filters}</h2>
              <button type="button" onClick={() => setOpen(false)} className="flex size-10 items-center justify-center rounded-full hover:bg-ivory-200" aria-label={t.close}>
                <X className="size-5" />
              </button>
            </div>
            {filters}
          </div>
        </div>
      )}
    </>
  );
}
