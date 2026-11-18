import { notFound } from "next/navigation";
import { Suspense } from "react";
import CatalogHeader from "@/components/store/CatalogHeader";
import CatalogView, { CatalogSkeleton } from "@/components/store/CatalogView";
import { currentLang, getDictionary } from "@/lib/dictionaries";
import { localePath } from "@/lib/i18n";
import { getCategories, getCategory } from "@/lib/storefront-api";

export async function generateStaticParams() {
  const categories = await getCategories();
  return categories.length ? categories.map((category) => ({ slug: category.slug })) : [{ slug: "earrings" }];
}

export async function generateMetadata({ params }) {
  const [{ slug }, lang, dict] = await Promise.all([params, currentLang(), getDictionary()]);
  const category = await getCategory(slug);
  if (!category) return {};
  const path = `/category/${category.slug}`;
  return {
    title: category.seo?.title || category.name,
    description: category.seo?.description || category.description || dict.shop.metaDescription,
    alternates: { canonical: localePath(lang, path), languages: { en: path, bn: `/bn${path}`, "x-default": path } },
    openGraph: category.image_url ? { images: [category.image_url] } : undefined,
  };
}

export default function CategoryPage({ params, searchParams }) {
  // URL data is read inside <Suspense> so navigation shows the skeleton instantly
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <Suspense fallback={<CatalogSkeleton />}>
        <CategoryContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CategoryContent({ params, searchParams }) {
  const [{ slug }, lang, dict, categories] = await Promise.all([params, currentLang(), getDictionary(), getCategories()]);
  const category = await getCategory(slug);
  if (!category) notFound();

  return (
    <>
      <CatalogHeader
        lang={lang}
        dict={dict}
        title={category.name}
        intro={category.description}
        categories={categories}
        activeSlug={category.slug}
        crumbs={[{ label: dict.shop.title.replace(/\*/g, ""), href: "/shop" }, { label: category.name }]}
      />
      <CatalogView searchParams={searchParams} category={category} lang={lang} dict={dict} basePath={`/category/${category.slug}`} />
    </>
  );
}
