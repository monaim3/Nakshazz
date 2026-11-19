"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Heart, Menu, Search, ShoppingBag, X } from "lucide-react";
import { localePath, stripLocale } from "@/lib/i18n";
import { openCartDrawer, useCartCount } from "@/lib/cart-storage";
import { useWishlistCount } from "@/lib/wishlist-storage";
import logo from "@/public/brand/logo-badge-320.webp";

// loaded on the first tap of the search icon
const SearchOverlay = dynamic(() => import("./SearchOverlay"), { ssr: false });

/** The নকসাজ badge logo (transparent PNG). `compact` = smaller, used once the header is solid. */
function Logo({ compact = false, alt }) {
  return (
    <Image
      src={logo}
      alt={alt}
      loading="eager"
      sizes="120px"
      className={`h-auto drop-shadow-[0_4px_10px_rgba(0,0,0,0.25)] transition-[width] duration-300 ${compact ? "w-[68px] lg:w-[84px]" : "w-[78px] lg:w-[112px]"}`}
    />
  );
}

/** Compact EN | BN switch; the current language is highlighted, the other links to the same page. */
function LanguageToggle({
  lang,
  path,
  light,
  label,
  className = "",
  onNavigate,
}) {
  return (
    <nav
      aria-label={label}
      className={`keep-tracking items-center text-xs font-medium tracking-[0.14em] ${className}`}
    >
      {[
        ["en", "EN"],
        ["bn", "BN"],
      ].map(([code, text], index) => (
        <span key={code} className="flex items-center">
          {index > 0 && (
            <span
              className={`mx-1.5 h-3 w-px ${light ? "bg-white/40" : "bg-navy-900/25"}`}
              aria-hidden
            />
          )}
          {code === lang ? (
            <span
              aria-current="true"
              className={`rounded-full px-1.5 py-1 ${light ? "text-marigold-300" : "text-lotus-500"}`}
            >
              {text}
            </span>
          ) : (
            <Link
              href={localePath(code, path)}
              hrefLang={code}
              onClick={onNavigate}
              className={`rounded-full px-1.5 py-1 transition-colors ${light ? "text-white/75 hover:text-white" : "text-navy-900/60 hover:text-navy-900"}`}
            >
              {text}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

/**
 * Over the homepage hero the header is transparent with light text (like the reference);
 * everywhere else, and after scrolling, it sits on a solid ivory background.
 */
export default function Header({ lang, dict, categories }) {
  const pathname = usePathname();
  const path = stripLocale(pathname);
  const isHome = path === "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const count = useCartCount();
  const favourites = useWishlistCount();
  const overlay = isHome && !scrolled && !open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "/shop", label: dict.nav.shop },
    ...categories.slice(0, 5).map((category) => ({
      href: `/category/${category.slug}`,
      label: category.name,
    })),
    { href: "/about", label: dict.nav.about },
    { href: "/contact", label: dict.nav.contact },
  ];

  const iconClass = `rounded-full p-2 transition-colors ${overlay ? "text-white hover:bg-white/10" : "text-navy-900 hover:bg-ivory-100"}`;

  return (
    <header
      className={`${isHome ? "fixed" : "sticky"} inset-x-0 top-0 z-40 transition-[background-color,box-shadow] duration-300 ${
        overlay
          ? "bg-gradient-to-b from-navy-900/45 to-transparent"
          : "bg-ivory-50/95 shadow-[0_1px_0_0_var(--color-ivory-200)] backdrop-blur"
      }`}
    >
      <div
        className={`brand-strip transition-opacity ${overlay ? "opacity-0" : "opacity-100"}`}
        aria-hidden
      />
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 py-2 sm:px-6 lg:py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`${iconClass} lg:hidden`}
            onClick={() => setOpen(true)}
            aria-label={dict.nav.menu}
            aria-expanded={open}
          >
            <Menu className="size-5" strokeWidth={1.5} />
          </button>
        </div>

        <Link href={localePath(lang, "/")} aria-label="Nakshazz home">
          <Logo compact={!overlay} alt={dict.brand.logoAlt} />
        </Link>

        <div className="flex items-center justify-end gap-1">
          <LanguageToggle
            lang={lang}
            path={path}
            light={overlay}
            label={dict.nav.languageLabel}
            className="mr-1 hidden sm:flex"
          />
          {/* Opens the search sheet (without JavaScript: the shop page, which has its own search) */}
          <a
            href={localePath(lang, "/shop")}
            onClick={(event) => {
              event.preventDefault();
              setSearching(true);
            }}
            className={iconClass}
            aria-label={dict.nav.search}
            aria-haspopup="dialog"
          >
            <Search className="size-5" strokeWidth={1.5} />
          </a>
          {searching && (
            <SearchOverlay
              lang={lang}
              categories={categories}
              onClose={() => setSearching(false)}
              t={{ title: dict.nav.search, close: dict.nav.close, placeholder: dict.shop.searchPlaceholder, empty: dict.shop.empty, from: dict.product.from, all: dict.nav.searchAll, failed: dict.shop.loadError }}
            />
          )}
          <Link
            href={localePath(lang, "/wishlist")}
            className={`${iconClass} relative`}
            aria-label={`${dict.nav.favourites} (${favourites})`}
          >
            <Heart className="size-5" strokeWidth={1.5} />
            {favourites > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-full bg-lotus-500 text-[10px] font-medium text-white">
                {favourites}
              </span>
            )}
          </Link>
          {/* Opens the bag drawer (opened in a new tab or without JavaScript: the checkout page) */}
          <a
            href={localePath(lang, "/checkout")}
            onClick={(event) => {
              event.preventDefault();
              openCartDrawer();
            }}
            className={`${iconClass} relative`}
            aria-label={`${dict.nav.bag} (${count})`}
            aria-haspopup="dialog"
          >
            <ShoppingBag className="size-5" strokeWidth={1.5} />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-full bg-lotus-500 text-[10px] font-medium text-white">
                {count}
              </span>
            )}
          </a>
        </div>
      </div>

      <nav aria-label="Main" className="hidden pb-4 lg:block">
        <ul className="flex items-center justify-center gap-5 px-4 xl:gap-10">
          {links.map((link) => {
            const active = path === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={localePath(lang, link.href)}
                  aria-current={active ? "page" : undefined}
                  className={`relative text-[11px] font-medium tracking-[0.14em] whitespace-nowrap uppercase xl:text-[13px] xl:tracking-[0.18em] transition-colors after:absolute after:inset-x-0 after:-bottom-1.5 after:h-px after:origin-center after:scale-x-0 after:bg-brand-gradient after:transition-transform hover:after:scale-x-100 ${
                    overlay ? "text-white" : "text-navy-900"
                  } ${active ? "after:scale-x-100" : ""}`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Portal to <body>: the header's backdrop-blur would otherwise trap this fixed panel inside the header box */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={dict.nav.menu}
          >
            <button
              type="button"
              className="absolute inset-0 bg-navy-900/40"
              aria-label={dict.nav.close}
              onClick={() => setOpen(false)}
            />
            <div className="relative flex h-full w-[85%] max-w-sm animate-fade-in flex-col overflow-y-auto bg-ivory-50 px-6 py-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <Logo compact alt={dict.brand.logoAlt} />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full p-2 text-navy-900"
                  aria-label={dict.nav.close}
                >
                  <X className="size-5" strokeWidth={1.5} />
                </button>
              </div>
              <div className="folk-rule my-6 opacity-70" />
              <ul className="space-y-1">
                {[
                  ...links,
                  { href: "/shop?sort=newest", label: dict.nav.newArrivals },
                  { href: "/track-order", label: dict.nav.trackOrder },
                ].map((link) => (
                  <li key={link.href}>
                    <Link
                      href={localePath(lang, link.href)}
                      onClick={() => setOpen(false)}
                      className="block py-3 font-display text-2xl text-navy-900"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-auto border-t border-ivory-200 pt-5">
                <LanguageToggle
                  lang={lang}
                  path={path}
                  label={dict.nav.languageLabel}
                  className="flex text-sm"
                  onNavigate={() => setOpen(false)}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </header>
  );
}
