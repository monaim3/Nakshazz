"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { localePath } from "@/lib/i18n";

const TEXT = {
  en: {
    eyebrow: "404",
    title: "This piece has wandered off",
    text: "The page you were looking for isn't here. It may have sold out, moved, or the link may have a typo.",
    shop: "Browse the shop",
    home: "Back to home",
  },
  bn: {
    eyebrow: "৪০৪",
    title: "পেজটি খুঁজে পাওয়া যায়নি",
    text: "আপনি যে পেজটি খুঁজছেন সেটি এখানে নেই। হয়তো বিক্রি হয়ে গেছে, সরানো হয়েছে বা লিংকে ভুল আছে।",
    shop: "শপ দেখুন",
    home: "হোমে ফিরে যান",
  },
};

/** Body of the store 404 page. Client-side only to read the language from the address. */
export default function NotFoundContent() {
  const pathname = usePathname() || "";
  const lang = pathname === "/bn" || pathname.startsWith("/bn/") ? "bn" : "en";
  const t = TEXT[lang];

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <span className="flex size-16 items-center justify-center rounded-full bg-ivory-200 text-navy-900">
        <Search className="size-7" strokeWidth={1.5} />
      </span>
      <p className="mt-6 text-sm font-medium tracking-[0.3em] text-lotus-600 uppercase">{t.eyebrow}</p>
      <h1 className="mt-2 font-display text-4xl text-navy-900 sm:text-5xl">{t.title}</h1>
      <p className="mt-4 text-ink/65">{t.text}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href={localePath(lang, "/shop")} className="rounded-full bg-navy-900 px-8 py-3 text-sm font-medium text-white shadow-lg shadow-navy-900/20 transition hover:-translate-y-0.5 hover:bg-navy-800">
          {t.shop}
        </Link>
        <Link href={localePath(lang, "/")} className="rounded-full border border-navy-900 px-8 py-3 text-sm font-medium text-navy-900 transition hover:bg-navy-900 hover:text-white">
          {t.home}
        </Link>
      </div>
    </section>
  );
}
