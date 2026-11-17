import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Outline pill; on hover a navy fill sweeps in from the left, text turns white and the arrow
 * nudges right. Used at the bottom of product sections.
 */
export default function ViewAllButton({ href, children }) {
  return (
    <div className="mt-10 flex justify-center">
      <Link
        href={href}
        className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-navy-900 px-8 py-3 text-sm font-medium text-navy-900 transition-colors duration-500 hover:text-white focus-visible:text-white"
      >
        <span
          className="absolute inset-0 -z-0 origin-left scale-x-0 rounded-full bg-navy-900 transition-transform duration-500 ease-[cubic-bezier(.65,0,.35,1)] group-hover:scale-x-100 group-focus-visible:scale-x-100"
          aria-hidden
        />
        <span className="relative">{children}</span>
        <ArrowRight className="relative size-4 transition-transform duration-500 group-hover:translate-x-1" />
      </Link>
    </div>
  );
}
