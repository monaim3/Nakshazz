import { Suspense } from "react";
import OrderView from "@/components/store/OrderView";
import { currentLang, getDictionary } from "@/lib/dictionaries";
import { getSettings } from "@/lib/storefront-api";

export const metadata = { title: "Order", robots: { index: false, follow: false } };

// One private page per order: always rendered on request (no static shell to prerender)
export const instant = false;

export default function OrderPage({ params, searchParams }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-20 sm:px-6">
      <Suspense fallback={null}>
        <OrderContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OrderContent({ params, searchParams }) {
  const [{ uuid }, query, lang, dict, settings] = await Promise.all([params, searchParams, currentLang(), getDictionary(), getSettings()]);
  const whatsapp = String(settings?.store?.whatsapp_number || "").replace(/\D/g, "").replace(/^88/, "");
  return <OrderView uuid={uuid} placed={query?.placed === "1"} lang={lang} t={dict.order} whatsapp={whatsapp || null} />;
}
