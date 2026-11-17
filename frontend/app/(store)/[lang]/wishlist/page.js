import SectionHeading from "@/components/store/SectionHeading";
import WishlistGrid from "@/components/store/WishlistGrid";
import { currentLang, getDictionary } from "@/lib/dictionaries";
import { localePath } from "@/lib/i18n";

export async function generateMetadata() {
  const [lang, dict] = await Promise.all([currentLang(), getDictionary()]);
  return {
    title: dict.wishlist.title,
    alternates: { canonical: localePath(lang, "/wishlist") },
    // personal, browser-only list: nothing for search engines
    robots: { index: false, follow: true },
  };
}

export default async function WishlistPage() {
  const [lang, dict] = await Promise.all([currentLang(), getDictionary()]);

  return (
    <section className="mx-auto min-h-[60vh] max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
      <SectionHeading as="h1" title={dict.wishlist.title} subtitle={dict.wishlist.subtitle} />
      <WishlistGrid lang={lang} dict={dict} />
    </section>
  );
}
