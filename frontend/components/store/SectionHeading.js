import Link from "next/link";

/** Centered serif heading with a small gold ornament, like the reference design. */
export default function SectionHeading({ title, subtitle, href, linkLabel, as: Tag = "h2" }) {
  return (
    <div className="mb-8 text-center sm:mb-10">
      <Tag className="font-display text-3xl font-medium tracking-wide text-navy-900 sm:text-4xl">{title}</Tag>
      <div className="mx-auto mt-3 flex items-center justify-center gap-3" aria-hidden>
        <span className="h-px w-10 bg-marigold-400" />
        <span className="size-1.5 rotate-45 bg-lotus-500" />
        <span className="h-px w-10 bg-marigold-400" />
      </div>
      {subtitle && <p className="mt-3 text-sm tracking-wide text-ink/60">{subtitle}</p>}
      {href && (
        <Link href={href} className="mt-4 inline-block border-b border-marigold-400 pb-0.5 text-xs font-medium tracking-[0.2em] text-lotus-600 uppercase hover:border-lotus-500">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
