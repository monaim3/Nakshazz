import { Suspense } from "react";
import CatalogHeader from "@/components/store/CatalogHeader";
import CatalogView, { CatalogSkeleton } from "@/components/store/CatalogView";
import { currentLang, getDictionary } from "@/lib/dictionaries";
import { localePath } from "@/lib/i18n";
import { getCategories } from "@/lib/storefront-api";

export async function generateMetadata() {
  const [lang, dict] = await Promise.all([currentLang(), getDictionary()]);
  return {
    title: dict.shop.metaTitle,
    description: dict.shop.metaDescription,
    alternates: { canonical: localePath(lang, "/shop"), languages: { en: "/shop", bn: "/bn/shop", "x-default": "/shop" } },
  };
}

export default async function ShopPage({ searchParams }) {
  const [lang, dict, categories] = await Promise.all([currentLang(), getDictionary(), getCategories()]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <CatalogHeader lang={lang} dict={dict} title={dict.shop.title} intro={dict.shop.intro} categories={categories} crumbs={[{ label: dict.shop.title.replace(/\*/g, "") }]} />
      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogView searchParams={searchParams} lang={lang} dict={dict} basePath="/shop" />
      </Suspense>
    </div>
  );
}
