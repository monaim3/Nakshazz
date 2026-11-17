import Image from "next/image";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { localePath } from "@/lib/i18n";
import badge from "@/public/brand/logo-badge-600.png";
import { FacebookIcon, InstagramIcon } from "./SocialIcons";

/** Year for the copyright line; cached so the footer stays part of the static page. */
async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export default async function Footer({ lang, dict, store, categories }) {
  const whatsapp = store.whatsapp_number ? `https://wa.me/88${String(store.whatsapp_number).replace(/\D/g, "").replace(/^88/, "")}` : null;
  const year = await currentYear();

  return (
    <footer className="bg-navy-900 text-ivory-100">
      <div className="brand-strip" aria-hidden />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr] lg:py-20">
        <div className="space-y-5">
          <Image src={badge} alt={dict.brand.logoAlt} className="h-auto w-36" sizes="144px" />
          <p className="max-w-xs text-sm leading-relaxed text-ivory-200/80">{store.tagline}</p>
          <div className="flex gap-3">
            {store.facebook_url && (
              <a href={store.facebook_url} target="_blank" rel="noreferrer" aria-label="Facebook" className="rounded-full border border-marigold-400/40 p-2.5 text-marigold-300 hover:bg-marigold-400 hover:text-navy-900">
                <FacebookIcon className="size-4" />
              </a>
            )}
            {store.instagram_url && (
              <a href={store.instagram_url} target="_blank" rel="noreferrer" aria-label="Instagram" className="rounded-full border border-marigold-400/40 p-2.5 text-marigold-300 hover:bg-marigold-400 hover:text-navy-900">
                <InstagramIcon className="size-4" />
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="rounded-full border border-marigold-400/40 p-2.5 text-marigold-300 hover:bg-marigold-400 hover:text-navy-900">
                <MessageCircle className="size-4" />
              </a>
            )}
          </div>
        </div>

        <FooterColumn title={dict.footer.shop}>
          <FooterLink href={localePath(lang, "/shop")}>{dict.nav.shop}</FooterLink>
          <FooterLink href={localePath(lang, "/shop?sort=newest")}>{dict.nav.newArrivals}</FooterLink>
          {categories.slice(0, 5).map((category) => (
            <FooterLink key={category.slug} href={localePath(lang, `/category/${category.slug}`)}>
              {category.name}
            </FooterLink>
          ))}
        </FooterColumn>

        <FooterColumn title={dict.footer.help}>
          <FooterLink href={localePath(lang, "/track-order")}>{dict.nav.trackOrder}</FooterLink>
          <FooterLink href={localePath(lang, "/policies/delivery-policy")}>{dict.footer.delivery}</FooterLink>
          <FooterLink href={localePath(lang, "/policies/return-refund-policy")}>{dict.footer.returns}</FooterLink>
          <FooterLink href={localePath(lang, "/policies/privacy-policy")}>{dict.footer.privacy}</FooterLink>
          <FooterLink href={localePath(lang, "/about")}>{dict.nav.about}</FooterLink>
        </FooterColumn>

        <FooterColumn title={dict.footer.contact}>
          {store.phone && (
            <a href={`tel:${String(store.phone).replace(/[^+\d]/g, "")}`} className="flex items-center gap-2.5 hover:text-marigold-300">
              <Phone className="size-4 text-marigold-400" strokeWidth={1.5} /> {store.phone}
            </a>
          )}
          {store.email && (
            <a href={`mailto:${store.email}`} className="flex items-center gap-2.5 hover:text-marigold-300">
              <Mail className="size-4 text-marigold-400" strokeWidth={1.5} /> {store.email}
            </a>
          )}
          {store.address && (
            <p className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-marigold-400" strokeWidth={1.5} /> {store.address}
            </p>
          )}
          <FooterLink href={localePath(lang, "/contact")}>{dict.nav.contact} →</FooterLink>
        </FooterColumn>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-ivory-200/60 sm:flex-row sm:justify-between sm:px-6">
          <p>
            © {year} {store.store_name || "Nakshazz"}. {dict.footer.rights}
          </p>
          <p className="tracking-[0.12em] uppercase">{dict.footer.payments}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }) {
  return (
    <div>
      <h2 className="mb-5 text-xs font-medium tracking-[0.24em] text-marigold-300 uppercase">{title}</h2>
      <div className="flex flex-col gap-3 text-sm text-ivory-100/85">{children}</div>
    </div>
  );
}

function FooterLink({ href, children }) {
  return (
    <Link href={href} className="w-fit hover:text-marigold-300">
      {children}
    </Link>
  );
}
