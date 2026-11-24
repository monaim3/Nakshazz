import HighlightTitle from "@/components/store/HighlightTitle";
import RecentOrders from "@/components/store/RecentOrders";
import TrackOrderForm from "@/components/store/TrackOrderForm";
import { currentLang, getDictionary } from "@/lib/dictionaries";
import { localePath } from "@/lib/i18n";

export async function generateMetadata() {
  const [lang, dict] = await Promise.all([currentLang(), getDictionary()]);
  return { title: dict.order.trackTitle.replace(/\*/g, ""), alternates: { canonical: localePath(lang, "/track-order") } };
}

export default async function TrackOrderPage() {
  const [lang, dict] = await Promise.all([currentLang(), getDictionary()]);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-20 sm:px-6">
      <h1 className="text-center font-display text-4xl text-navy-900 sm:text-5xl">
        <HighlightTitle text={dict.order.trackTitle} />
      </h1>
      <p className="mx-auto mt-3 mb-8 max-w-md text-center text-sm text-ink/65">{dict.order.trackIntro}</p>
      <RecentOrders lang={lang} />
      <TrackOrderForm lang={lang} t={dict.order} />
    </div>
  );
}
