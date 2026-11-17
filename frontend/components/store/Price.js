import { localizeDigits } from "@/lib/i18n";

const formatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function formatPrice(value, lang = "en") {
  return `৳${localizeDigits(formatter.format(Number(value || 0)), lang)}`;
}

/** Price with optional struck-through "was" price. */
export default function Price({ value, compareAt, lang = "en", prefix, className = "" }) {
  const onSale = compareAt && Number(compareAt) > Number(value);

  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 ${className}`}>
      {prefix && <span className="text-xs tracking-wide text-ink/60 uppercase">{prefix}</span>}
      <span className={`font-medium tabular-nums ${onSale ? "text-lotus-600" : "text-navy-900"}`}>{formatPrice(value, lang)}</span>
      {onSale && (
        <span className="text-sm text-ink/45 line-through tabular-nums">
          <span className="sr-only">was </span>
          {formatPrice(compareAt, lang)}
        </span>
      )}
    </p>
  );
}
