"use client";

import { isColourOption, swatchFor } from "@/lib/swatches";

/** Human label for a variant: its option values, else its title, else its position. */
export function variantLabel(variant, index) {
  const options = Object.values(variant.options || {});
  return options.length ? options.join(" / ") : variant.title || String(index + 1);
}

/**
 * Variant selector. When the product has a single colour/metal option and every value has a
 * known swatch, it shows round colour swatches ("Color: Golden"); otherwise text chips.
 * Sold-out variants stay selectable (so customers see they exist) but are crossed out.
 */
export default function VariantPicker({ product, value, onChange, t }) {
  const names = product.option_names || [];
  const colourName = names.length === 1 && isColourOption(names[0]) ? names[0] : null;
  const swatches = colourName ? product.variants.map((variant) => swatchFor(variant.options?.[colourName])) : [];
  const useSwatches = colourName && swatches.every(Boolean);
  const selected = product.variants.find((variant) => variant.id === value);
  const selectedIndex = product.variants.indexOf(selected);

  return (
    <fieldset className="mt-6">
      <legend className="text-xs font-medium tracking-[0.18em] text-navy-900 uppercase">
        {names.join(" / ") || t.variant}
        {useSwatches && selected && <span className="ml-2 font-normal tracking-normal text-ink/60 normal-case">{variantLabel(selected, selectedIndex)}</span>}
      </legend>

      <div className={`mt-3 flex flex-wrap ${useSwatches ? "gap-3" : "gap-2"}`}>
        {product.variants.map((variant, index) => {
          const unavailable = variant.stock_status === "out_of_stock";
          const isSelected = variant.id === value;
          const label = variantLabel(variant, index);
          const title = unavailable ? `${label} (${t.soldOut})` : label;

          if (useSwatches) {
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => onChange(variant.id)}
                aria-pressed={isSelected}
                aria-label={title}
                title={title}
                className={`relative size-10 rounded-full p-[3px] transition ${isSelected ? "ring-2 ring-navy-900 ring-offset-2" : "ring-1 ring-ivory-300 hover:ring-navy-900/50"}`}
              >
                <span className="block size-full rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]" style={{ background: swatches[index] }} />
                {unavailable && <span className="absolute inset-0 m-auto h-px w-[120%] -translate-x-[8%] rotate-45 bg-ink/60" aria-hidden />}
              </button>
            );
          }

          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => onChange(variant.id)}
              aria-pressed={isSelected}
              title={title}
              className={`min-w-12 rounded-xl border px-4 py-2.5 text-sm transition ${isSelected ? "border-navy-900 bg-navy-900 text-white" : "border-ivory-300 hover:border-navy-900"} ${unavailable ? "text-ink/40 line-through" : ""}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
