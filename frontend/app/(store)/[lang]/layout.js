import { Cormorant_Garamond, Hind_Siliguri, Jost, Pinyon_Script } from "next/font/google";
import Header from "@/components/store/Header";
import Footer from "@/components/store/Footer";
import { currentLang, getDictionary } from "@/lib/dictionaries";
import { getCategories, getSettings } from "@/lib/storefront-api";
import { LOCALES } from "@/lib/i18n";
import "../../globals.css";

const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], display: "swap" });
const pinyon = Pinyon_Script({ variable: "--font-pinyon", subsets: ["latin"], weight: "400", display: "swap" });
const jost = Jost({ variable: "--font-jost", subsets: ["latin"], weight: ["300", "400", "500"], display: "swap" });
const hind = Hind_Siliguri({ variable: "--font-hind", subsets: ["bengali", "latin"], weight: ["400", "500", "600"], display: "swap", preload: false });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata() {
  const [lang, settings] = await Promise.all([currentLang(), getSettings()]);
  const store = settings?.store || {};
  const name = store.store_name || "Nakshazz";

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${name} — ${store.tagline || "Handmade Jewellery"}`, template: `%s | ${name}` },
    description: lang === "bn" ? "নকসাজ — বাংলাদেশে হাতে তৈরি গহনা। ক্যাশ অন ডেলিভারি ও বিকাশ।" : "Handmade jewellery crafted in Bangladesh. Earrings, necklaces, bangles and more — cash on delivery and bKash.",
    openGraph: { siteName: name, locale: lang === "bn" ? "bn_BD" : "en_US", type: "website" },
    icons: { icon: "/icon.png", apple: "/apple-icon.png" },
  };
}

export const viewport = {
  themeColor: "#fcf7f4",
};

export default async function StoreLayout({ children }) {
  const [lang, dict, settings, categories] = await Promise.all([currentLang(), getDictionary(), getSettings(), getCategories()]);
  const store = settings?.store || {};

  return (
    <html lang={lang} className={`${cormorant.variable} ${pinyon.variable} ${jost.variable} ${hind.variable}`}>
      <body suppressHydrationWarning className={`min-h-screen bg-ivory-50 text-ink antialiased ${lang === "bn" ? "font-bangla" : "font-body"}`}>
        <a href="#main" className="sr-only z-50 rounded bg-navy-900 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Skip to content
        </a>
        <Header lang={lang} dict={dict} categories={categories} />
        <main id="main">{children}</main>
        <Footer lang={lang} dict={dict} store={store} categories={categories} />
      </body>
    </html>
  );
}
