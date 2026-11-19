import Image from "next/image";
import ContentPage from "@/components/store/ContentPage";
import { currentLang, getDictionary } from "@/lib/dictionaries";
import { localePath } from "@/lib/i18n";
import { getPage } from "@/lib/storefront-api";
import badge from "@/public/brand/logo-badge-600.png";

export async function generateMetadata() {
  const [lang, dict, page] = await Promise.all([currentLang(), getDictionary(), getPage("about")]);
  return {
    title: page?.seo?.title || dict.pages.aboutTitle.replace(/\*/g, ""),
    description: page?.seo?.description || dict.pages.aboutDescription,
    alternates: { canonical: localePath(lang, "/about"), languages: { en: "/about", bn: "/bn/about", "x-default": "/about" } },
  };
}

export default async function AboutPage() {
  const [lang, dict, page] = await Promise.all([currentLang(), getDictionary(), getPage("about")]);
  return (
    <ContentPage
      page={page}
      lang={lang}
      dict={dict}
      title={dict.pages.aboutTitle}
      aside={
        <div className="relative mx-auto mb-10 w-56">
          <div className="absolute inset-4 rounded-full bg-marigold-200/60 blur-2xl" aria-hidden />
          <Image src={badge} alt={dict.brand.logoAlt} className="relative h-auto w-full drop-shadow-xl" sizes="224px" priority />
        </div>
      }
    />
  );
}
