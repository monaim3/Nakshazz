import { notFound } from "next/navigation";
import { Suspense } from "react";
import ContentPage from "@/components/store/ContentPage";
import { currentLang, getDictionary } from "@/lib/dictionaries";
import { localePath } from "@/lib/i18n";
import { getPage } from "@/lib/storefront-api";

const POLICIES = ["delivery-policy", "return-refund-policy", "privacy-policy"];

// Rebuilt on the server after an admin edit. The header reads the page address
// (usePathname) outside <Suspense>, which Next.js only accepts on a route that is allowed
// to wait for the server; without this the rebuild failed and the page answered 500.
export const instant = false;

export function generateStaticParams() {
  return POLICIES.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const [{ slug }, lang] = await Promise.all([params, currentLang()]);
  if (!POLICIES.includes(slug)) return {};
  const page = await getPage(slug);
  const path = `/policies/${slug}`;
  return {
    title: page?.seo?.title || page?.title,
    description: page?.seo?.description || undefined,
    alternates: { canonical: localePath(lang, path), languages: { en: path, bn: `/bn${path}`, "x-default": path } },
  };
}

export default function PolicyPage({ params }) {
  // URL data is read inside <Suspense> (instant navigation)
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <PolicyContent params={params} />
    </Suspense>
  );
}

async function PolicyContent({ params }) {
  const [{ slug }, lang, dict] = await Promise.all([params, currentLang(), getDictionary()]);
  if (!POLICIES.includes(slug)) notFound();
  const page = await getPage(slug);
  if (!page) notFound();
  return <ContentPage page={page} lang={lang} dict={dict} title={dict.pages.titles[slug] || page.title} />;
}
