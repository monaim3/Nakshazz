import { localizeDigits } from "@/lib/i18n";
import HighlightTitle from "./HighlightTitle";
import { FacebookIcon, InstagramIcon } from "./SocialIcons";

const INSTAGRAM_GRADIENT = "linear-gradient(45deg,#f9ce34 0%,#ee2a7b 50%,#6228d7 100%)";

/** "@nakshazz_" from an Instagram profile URL. */
function handleFrom(url) {
  const match = String(url || "").match(/instagram\.com\/([^/?#]+)/i);
  return match ? `@${match[1]}` : "Instagram";
}

/**
 * Instagram-style "follow us" block: text + buttons on the left, a tilted mosaic of real
 * product photos on the right; every tile links to the Instagram profile.
 */
export default function SocialSection({ store, products, t, lang }) {
  const instagram = store.instagram_url;
  const facebook = store.facebook_url;
  const tiles = products.filter((product) => product.image).slice(0, 6);

  return (
    <section className="px-4 py-8 sm:px-6 lg:py-10">
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,var(--color-lotus-50),var(--color-ivory-100)_45%,var(--color-marigold-100))] px-6 py-12 sm:px-12 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
        <div className="absolute -top-24 -right-24 size-72 rounded-full bg-lotus-500/10 blur-3xl" aria-hidden />
        <div className="absolute -bottom-24 -left-24 size-72 rounded-full bg-marigold-400/20 blur-3xl" aria-hidden />

        {/* Text + buttons */}
        <div className="relative text-center lg:text-left">
          {instagram && (
            <a href={instagram} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-white/70 py-1.5 pr-4 pl-1.5 text-sm font-medium text-navy-900 shadow-sm backdrop-blur transition hover:bg-white">
              <span className="flex size-7 items-center justify-center rounded-full text-white" style={{ background: INSTAGRAM_GRADIENT }}>
                <InstagramIcon className="size-4" />
              </span>
              {handleFrom(instagram)}
            </a>
          )}
          <h2 className="mt-5 font-display text-4xl leading-tight text-navy-900 sm:text-5xl">
            <HighlightTitle text={t.social} />
          </h2>
          <p className="mx-auto mt-3 max-w-md text-ink/65 lg:mx-0">{t.socialText}</p>

          <p className="mt-6 flex items-baseline justify-center gap-2 lg:justify-start">
            <span className="font-display text-4xl text-lotus-600">{localizeDigits("2.7K+", lang)}</span>
            <span className="text-sm text-ink/60">{t.socialFollowers}</span>
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
            {instagram && (
              <a
                href={instagram}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-sm font-medium text-white shadow-[0_12px_30px_-10px_rgba(238,42,123,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-10px_rgba(238,42,123,0.8)]"
                style={{ background: INSTAGRAM_GRADIENT }}
              >
                <InstagramIcon className="size-5 transition group-hover:rotate-12" />
                {t.socialFollow}
              </a>
            )}
            {facebook && (
              <a
                href={facebook}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-3.5 text-sm font-medium text-navy-900 shadow-sm ring-1 ring-navy-900/10 transition hover:-translate-y-0.5 hover:text-[#1877f2] hover:shadow-md"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-[#1877f2] text-white">
                  <FacebookIcon className="size-4" />
                </span>
                {t.socialLike}
              </a>
            )}
          </div>
        </div>

        {/* Photo mosaic */}
        {tiles.length > 0 && (
          <ul className="relative grid grid-cols-3 gap-3 sm:gap-4">
            {tiles.map((product, index) => (
              <li key={product.id} className={index % 3 === 1 ? "translate-y-6" : index % 3 === 2 ? "-translate-y-2" : ""}>
                <a
                  href={instagram || facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative block aspect-square overflow-hidden rounded-2xl shadow-[0_10px_30px_-12px_rgba(15,27,53,0.35)] transition duration-500 hover:z-10 hover:-rotate-2 hover:scale-[1.04]"
                  aria-label={`${product.name} — ${handleFrom(instagram)}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- optimised WebP from the API */}
                  <img src={product.image.urls.md} alt="" loading="lazy" className="size-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-navy-950/45 opacity-0 transition duration-300 group-hover:opacity-100">
                    <InstagramIcon className="size-8 scale-75 text-white transition duration-300 group-hover:scale-100" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
