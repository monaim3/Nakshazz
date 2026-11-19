"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { localizeDigits } from "@/lib/i18n";
import { swatchFor } from "@/lib/swatches";
import PriceRange from "./PriceRange";

const SORTS = ["newest", "popular", "price", "-price", "name"];

/**
 * Search, sort and filters for the shop and category pages. Everything lives in the URL
 * (shareable, back button works, crawlable); changing a control navigates to the new URL
 * and the server re-renders the product grid.
 */
export default function CatalogToolbar({ query, total, facets, lang, t }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(query.q || "");

  function apply(changes) {
    const next = new URLSearchParams();
    const merged = { ...query, ...changes, page: undefined };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== null && value !== "" && value !== false) next.set(key, String(value));
    }
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const selectedColors = query.color ? query.color.split(",") : [];
  const colors = facets?.colors || [];
  const activeFilters = [query.q, query.min_price || query.max_price, query.in_stock, query.on_sale, ...selectedColors].filter(Boolean).length;
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

      {facets?.price && facets.price.max > facets.price.min && (
        <PriceRange
          key={`${query.min_price || ""}-${query.max_price || ""}-${facets.price.min}-${facets.price.max}`}
          min={facets.price.min}
          max={facets.price.max}
          valueMin={query.min_price ? Number(query.min_price) : undefined}
          valueMax={query.max_price ? Number(query.max_price) : undefined}
          onCommit={(low, high) => apply({ min_price: low, max_price: high })}
          lang={lang}
          t={t}
        />
      )}

      {colors.length > 0 && (
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-navy-900 uppercase">{t.colour}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {colors.map((color) => {
              const on = selectedColors.includes(color.value);
              const swatch = swatchFor(color.value);
              return (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => apply({ color: (on ? selectedColors.filter((c) => c !== color.value) : [...selectedColors, color.value]).join(",") || undefined })}
                  aria-pressed={on}
                  className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition ${on ? "border-navy-900 bg-navy-900 text-white" : "border-ivory-300 bg-white text-navy-900 hover:border-navy-900"}`}
                >
                  <span className="size-6 rounded-full ring-1 ring-black/10" style={{ background: swatch || "var(--color-ivory-200)" }} />
                  {color.value}
                  <span className={on ? "text-white/60" : "text-ink/40"}>{localizeDigits(String(color.count), lang)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <p className="text-xs font-medium tracking-[0.18em] text-navy-900 uppercase">{t.availability}</p>
        <Toggle label={t.inStockOnly} checked={Boolean(query.in_stock)} onChange={(checked) => apply({ in_stock: checked ? 1 : undefined })} />
        {(facets?.on_sale > 0 || query.on_sale) && <Toggle label={t.onSale} checked={Boolean(query.on_sale)} onChange={(checked) => apply({ on_sale: checked ? 1 : undefined })} />}
      </div>

      {activeFilters > 0 && (
        <button
          type="button"
          onClick={() => {
            setSearch("");
            apply({ q: undefined, min_price: undefined, max_price: undefined, in_stock: undefined, on_sale: undefined, color: undefined });
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

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm text-navy-900">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-ivory-300 transition peer-checked:bg-navy-900 peer-focus-visible:outline-2 peer-focus-visible:outline-marigold-400 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" aria-hidden />
    </label>
  );
}
