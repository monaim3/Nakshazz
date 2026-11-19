import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import ContactForm from "@/components/store/ContactForm";
import HighlightTitle from "@/components/store/HighlightTitle";
import { FacebookIcon, InstagramIcon } from "@/components/store/SocialIcons";
import { currentLang, getDictionary } from "@/lib/dictionaries";
import { localePath } from "@/lib/i18n";
import { getSettings } from "@/lib/storefront-api";

export async function generateMetadata() {
  const [lang, dict] = await Promise.all([currentLang(), getDictionary()]);
  return {
    title: dict.pages.contactTitle.replace(/\*/g, ""),
    description: dict.pages.contactIntro,
    alternates: { canonical: localePath(lang, "/contact"), languages: { en: "/contact", bn: "/bn/contact", "x-default": "/contact" } },
  };
}

export default async function ContactPage() {
  const [dict, settings] = await Promise.all([getDictionary(), getSettings()]);
  const t = dict.pages;
  const store = settings?.store || {};
  const whatsapp = String(store.whatsapp_number || "").replace(/\D/g, "").replace(/^88/, "");

  const channels = [
    whatsapp && { icon: MessageCircle, label: "WhatsApp", value: store.whatsapp_number, href: `https://wa.me/88${whatsapp}`, tone: "bg-[#25d366] text-white", external: true },
    store.phone && { icon: Phone, label: t.call, value: store.phone, href: `tel:${String(store.phone).replace(/[^+\d]/g, "")}`, tone: "bg-navy-900 text-white" },
    store.email && { icon: Mail, label: t.emailUs, value: store.email, href: `mailto:${store.email}`, tone: "bg-lotus-500 text-white" },
    store.facebook_url && { icon: FacebookIcon, label: "Facebook", value: "facebook.com/nakshazz", href: store.facebook_url, tone: "bg-[#1877f2] text-white", external: true },
    store.instagram_url && { icon: InstagramIcon, label: "Instagram", value: "@nakshazz_", href: store.instagram_url, tone: "bg-[linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)] text-white", external: true },
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-6">
      <h1 className="text-center font-display text-4xl text-navy-900 sm:text-5xl">
        <HighlightTitle text={t.contactTitle} />
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-ink/65">{t.contactIntro}</p>
      <div className="folk-rule mx-auto mt-5 mb-10 w-32" aria-hidden />

      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          {channels.map(({ icon: Icon, label, value, href, tone, external }) => (
            <a key={label} href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="group flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-ivory-200 transition hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-15px_rgba(15,27,53,0.35)]">
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs tracking-[0.15em] text-ink/50 uppercase">{label}</span>
                <span className="block truncate font-medium text-navy-900 group-hover:text-lotus-600">{value}</span>
              </span>
            </a>
          ))}
          <div className="flex items-center gap-4 rounded-2xl bg-ivory-100 p-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-marigold-200 text-navy-900">
              <MapPin className="size-5" />
            </span>
            <span>
              <span className="block text-xs tracking-[0.15em] text-ink/50 uppercase">{t.location}</span>
              <span className="block font-medium text-navy-900">{store.address || t.locationValue}</span>
              <span className="block text-xs text-ink/55">{t.hours}</span>
            </span>
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-display text-2xl text-navy-900">{t.formTitle}</h2>
          <ContactForm t={t.form} />
        </div>
      </div>
    </div>
  );
}
