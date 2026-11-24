"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { hasLocale, localePath } from "@/lib/i18n";

const TEXT = {
  en: {
    title: "Something went wrong",
    text: "We couldn't load this page just now. It's usually a hiccup in the connection, so please try again.",
    retry: "Try again",
    home: "Back to home",
    ref: "Reference",
  },
  bn: {
    title: "কিছু একটা সমস্যা হয়েছে",
    text: "এই মুহূর্তে পেজটি লোড করা যায়নি। সাধারণত এটি সংযোগের সাময়িক সমস্যা, আবার চেষ্টা করুন।",
    retry: "আবার চেষ্টা করুন",
    home: "হোমে ফিরে যান",
    ref: "রেফারেন্স",
  },
};

/** Friendly error screen for storefront pages; the header and footer stay in place. */
export default function StoreError({ error, retry }) {
  const params = useParams();
  const lang = hasLocale(params?.lang) ? params.lang : "en";
  const t = TEXT[lang];
  const digest = error instanceof Error ? error.digest : undefined;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6" role="alert">
      <span className="flex size-16 items-center justify-center rounded-full bg-lotus-50 text-lotus-600">
        <RotateCcw className="size-7" strokeWidth={1.5} />
      </span>
      <h1 className="mt-6 font-display text-4xl text-navy-900 sm:text-5xl">{t.title}</h1>
      <p className="mt-4 text-ink/65">{t.text}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => retry()} className="rounded-full bg-navy-900 px-8 py-3 text-sm font-medium text-white shadow-lg shadow-navy-900/20 transition hover:-translate-y-0.5 hover:bg-navy-800">
          {t.retry}
        </button>
        <Link href={localePath(lang, "/")} className="rounded-full border border-navy-900 px-8 py-3 text-sm font-medium text-navy-900 transition hover:bg-navy-900 hover:text-white">
          {t.home}
        </Link>
      </div>
      {digest && (
        <p className="mt-6 text-xs text-ink/40">
          {t.ref}: {digest}
        </p>
      )}
    </section>
  );
}
