import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { localePath } from "@/lib/i18n";
import HighlightTitle from "./HighlightTitle";
import Markdown from "./Markdown";

/** Layout for admin-edited text pages (Our Story, policies). Body is safe Markdown. */
export default function ContentPage({ page, lang, dict, title, aside = null }) {
  // the stored body may start with its own "## Title" line — drop it, the page has a real <h1>
  const body = String(page?.body || "").replace(/^\s*#{1,2}\s+[^\n]*\n/, "");
  const updated = page?.updated_at ? new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(page.updated_at)) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-20 sm:px-6">
      <nav aria-label={dict.shop.breadcrumb} className="flex items-center justify-center gap-1 text-xs text-ink/55">
        <Link href={localePath(lang, "/")} className="hover:text-navy-900">
          {dict.shop.home}
        </Link>
        <ChevronRight className="size-3" />
        <span aria-current="page" className="text-navy-900">
          {title.replace(/\*/g, "")}
        </span>
      </nav>
      <h1 className="mt-4 text-center font-display text-4xl text-navy-900 sm:text-5xl">
        <HighlightTitle text={title} />
      </h1>
      <div className="folk-rule mx-auto mt-5 mb-10 w-32" aria-hidden />
      {aside}
      <article className="text-[17px]">
        <Markdown source={body} />
      </article>
      {updated && <p className="mt-12 border-t border-ivory-200 pt-5 text-center text-xs text-ink/45">{dict.pages.updated.replace(":date", updated)}</p>}
    </div>
  );
}
