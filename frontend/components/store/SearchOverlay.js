"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Loader2, Search, X } from "lucide-react";
import { localePath, localizeDigits } from "@/lib/i18n";
import { formatPrice } from "./Price";

const API = process.env.NEXT_PUBLIC_API_URL;
const LIMIT = 6;

/** 0 = the name starts with the typed text, 1 = one of its words does, 2 = it only contains it. */
function closeness(name, text) {
  const lower = name.toLowerCase();
  const needle = text.toLowerCase();
  if (lower.startsWith(needle)) return 0;
  if (lower.split(/[\s&-]+/).some((word) => word.startsWith(needle))) return 1;
  return 2;
}

/**
 * Best matches first. For one or two letters ("a") only names or words that START with them
 * are kept, otherwise nearly every product would match; if none start that way, all are kept.
 */
function rank(items, text) {
  const sorted = [...items].sort((a, b) => closeness(a.name, text) - closeness(b.name, text));
  if (text.length > 2) return sorted;
  const starting = sorted.filter((item) => closeness(item.name, text) < 2);
  return starting.length ? starting : sorted;
}

/**
 * Search sheet under the header: suggestions appear while typing (from the first letter),
 * Enter opens the full results in the shop. Mounted by the header only while open.
 */
export default function SearchOverlay({ lang, t, categories = [], onClose }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [text, setText] = useState("");
  const [state, setState] = useState({ for: "", products: [], total: 0, failed: false });
  const query = text.trim();
  const loading = query !== "" && state.for !== query;

  // the header re-renders often (scroll, bag count): keep the latest onClose without re-running the effect
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, []);

  // suggestions, a moment after the customer stops typing
  useEffect(() => {
    if (!query) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${API}/products?q=${encodeURIComponent(query)}&per_page=48`, { signal: controller.signal, headers: { Accept: "application/json" } })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((body) => setState({ for: query, products: rank(body.data || [], query).slice(0, LIMIT), total: body.meta?.total ?? (body.data || []).length, failed: false }))
        .catch((reason) => reason.name !== "AbortError" && setState({ for: query, products: [], total: 0, failed: true }));
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // category shortcuts: for one or two letters only those with a word starting that way
  const matchingCategories = categories.filter((category) => query && (query.length > 2 ? category.name.toLowerCase().includes(query.toLowerCase()) : closeness(category.name, query) < 2)).slice(0, 3);
  const resultsHref = localePath(lang, `/shop?q=${encodeURIComponent(query)}`);
  const fresh = state.for === query;

  return createPortal(
    <div className="fixed inset-0 z-[65]" role="dialog" aria-modal="true" aria-label={t.title}>
      <button type="button" className="absolute inset-0 bg-navy-950/45 backdrop-blur-[2px]" onClick={onClose} aria-label={t.close} tabIndex={-1} />
      <div className="relative animate-fade-in bg-ivory-50 shadow-[0_24px_60px_-20px_rgba(15,27,53,0.45)]">
        <div className="brand-strip" aria-hidden />
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
          <form
            action={localePath(lang, "/shop")}
            method="get"
            onSubmit={(event) => {
              event.preventDefault();
              if (!query) return;
              router.push(resultsHref);
              onClose();
            }}
            className="flex items-center gap-3"
          >
            <div className="flex h-13 flex-1 items-center gap-3 rounded-full border border-ivory-300 bg-white px-5 focus-within:border-navy-900">
              {loading ? <Loader2 className="size-5 shrink-0 animate-spin text-ink/40" /> : <Search className="size-5 shrink-0 text-ink/40" />}
              <input
                ref={inputRef}
                name="q"
                type="search"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t.placeholder}
                maxLength={100}
                autoComplete="off"
                enterKeyHint="search"
                aria-label={t.title}
                className="w-full bg-transparent text-base text-navy-900 outline-none placeholder:text-ink/40 [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
            <button type="button" onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-full text-navy-900 transition hover:bg-ivory-200" aria-label={t.close}>
              <X className="size-5" />
            </button>
          </form>

          {query && (
            <div className="mt-4 max-h-[min(62vh,520px)] overflow-y-auto" aria-live="polite">
              {matchingCategories.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {matchingCategories.map((category) => (
                    <Link key={category.id} href={localePath(lang, `/category/${category.slug}`)} onClick={onClose} className="rounded-full border border-ivory-300 bg-white px-4 py-1.5 text-sm text-navy-900 transition hover:border-navy-900">
                      {category.name}
                    </Link>
                  ))}
                </div>
              )}

              {fresh && state.products.length > 0 && (
                <ul className="divide-y divide-ivory-200">
                  {state.products.map((product) => (
                    <li key={product.id}>
                      <Link href={localePath(lang, `/product/${product.slug}`)} onClick={onClose} className="group flex items-center gap-4 rounded-xl px-2 py-2.5 transition hover:bg-white">
                        <span className="size-14 shrink-0 overflow-hidden rounded-xl bg-ivory-200">
                          {product.image && (
                            // eslint-disable-next-line @next/next/no-img-element -- optimised WebP from the API
                            <img src={product.image.urls.sm} alt="" className="size-full object-cover" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-display text-lg text-navy-900">{product.name}</span>
                          <span className="block text-sm text-ink/60 tabular-nums">
                            {product.has_price_range ? `${t.from} ` : ""}
                            {formatPrice(product.price, lang)}
                          </span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-ink/30 transition group-hover:translate-x-1 group-hover:text-navy-900" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {fresh && state.products.length === 0 && matchingCategories.length === 0 && <p className="px-2 py-6 text-center text-sm text-ink/60">{state.failed ? t.failed : t.empty}</p>}

              {fresh && state.total > state.products.length && (
                <Link href={resultsHref} onClick={onClose} className="mt-3 flex items-center justify-center gap-2 rounded-full border border-navy-900 py-3 text-sm font-medium text-navy-900 transition hover:bg-navy-900 hover:text-white">
                  {t.all.replace(":count", localizeDigits(String(state.total), lang))} <ArrowRight className="size-4" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
