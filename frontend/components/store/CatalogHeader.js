import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { localePath } from "@/lib/i18n";
import HighlightTitle from "./HighlightTitle";

/** Breadcrumb, title, intro and category chips shared by the shop and category pages. */
export default function CatalogHeader({ lang, dict, title, intro, categories, activeSlug = null, crumbs = [] }) {
  const t = dict.shop;
  const chips = [{ slug: null, name: t.all, href: "/shop" }, ...categories.map((category) => ({ slug: category.slug, name: category.name, href: `/category/${category.slug}` }))];

  return (
    <header className="pt-6 pb-6 text-center lg:pt-8">
      <nav aria-label={t.breadcrumb} className="flex flex-wrap items-center justify-center gap-1 text-xs text-ink/55">
        <Link href={localePath(lang, "/")} className="hover:text-navy-900">
          {t.home}
        </Link>
        {crumbs.map((crumb) => (
          <span key={crumb.label} className="flex items-center gap-1">
            <ChevronRight className="size-3" />
            {crumb.href ? (
              <Link href={localePath(lang, crumb.href)} className="hover:text-navy-900">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-navy-900">
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      <h1 className="mt-4 font-display text-4xl text-navy-900 sm:text-5xl">
        <HighlightTitle text={title} />
      </h1>
      {intro && <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink/65">{intro}</p>}

      <ul className="scrollbar-none -mx-4 mt-7 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [&>li:first-child]:ml-auto [&>li:last-child]:mr-auto">
        {chips.map((chip) => {
          const active = chip.slug === activeSlug;
          return (
            <li key={chip.href} className="shrink-0 snap-start">
              <Link
                href={localePath(lang, chip.href)}
                aria-current={active ? "page" : undefined}
                className={`block rounded-full px-5 py-2 text-sm transition ${active ? "bg-navy-900 text-white" : "border border-ivory-300 bg-white text-navy-900 hover:border-navy-900"}`}
              >
                {chip.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </header>
  );
}
