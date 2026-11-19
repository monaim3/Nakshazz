import CheckoutForm from "@/components/store/CheckoutForm";
import HighlightTitle from "@/components/store/HighlightTitle";
import { currentLang, getDictionary } from "@/lib/dictionaries";
import { getSettings } from "@/lib/storefront-api";

export async function generateMetadata() {
  const dict = await getDictionary();
  return { title: dict.checkout.title.replace(/\*/g, ""), robots: { index: false, follow: false } };
}

export default async function CheckoutPage() {
  const [lang, dict, settings] = await Promise.all([currentLang(), getDictionary(), getSettings()]);
  const store = settings?.store || {};
  // bKash is offered only when it is enabled AND a number is set to receive money
  const bkashReady = store.bkash_enabled === "1" && Boolean(store.bkash_number);
  const methods = (settings?.payment_methods || []).map((m) => m.value).filter((value) => value !== "bkash" || bkashReady);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-6">
      <h1 className="mb-8 text-center font-display text-4xl text-navy-900 sm:text-5xl">
        <HighlightTitle text={dict.checkout.title} />
      </h1>
      <CheckoutForm
        lang={lang}
        t={dict.checkout}
        zones={settings?.delivery_zones || []}
        methods={methods.length ? methods : ["cod"]}
        bkash={bkashReady ? { number: store.bkash_number, accountType: store.bkash_account_type, instructions: store.bkash_instructions } : null}
      />
    </div>
  );
}
