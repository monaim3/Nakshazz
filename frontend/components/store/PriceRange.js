"use client";

import { useState } from "react";
import { localizeDigits } from "@/lib/i18n";

/**
 * Two-handle price slider with editable min/max boxes. Dragging updates the numbers live;
 * the filter is applied when a handle is released (or a box loses focus / Enter).
 * The parent remounts it (key) when the URL values change, e.g. after "Clear filters".
 */
export default function PriceRange({ min, max, valueMin, valueMax, onCommit, lang, t }) {
  const step = max - min > 2000 ? 50 : 10;
  const [low, setLow] = useState(valueMin ?? min);
  const [high, setHigh] = useState(valueMax ?? max);

  if (!(max > min)) return null;

  const commit = (nextLow = low, nextHigh = high) => {
    const a = Math.max(min, Math.min(Number(nextLow) || min, max));
    const b = Math.min(max, Math.max(Number(nextHigh) || max, a));
    setLow(a);
    setHigh(b);
    onCommit(a <= min ? undefined : a, b >= max ? undefined : b);
  };

  const pct = (value) => ((value - min) / (max - min)) * 100;
  const n = (value) => localizeDigits(new Intl.NumberFormat("en-IN").format(value), lang);
  const thumb =
    "pointer-events-none absolute inset-x-0 top-1/2 h-0 w-full -translate-y-1/2 appearance-none bg-transparent outline-none [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-navy-900 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-navy-900 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md active:[&::-webkit-slider-thumb]:cursor-grabbing focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-marigold-300";

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-[0.18em] text-navy-900 uppercase">{t.price}</p>
        <p className="text-sm font-medium text-navy-900 tabular-nums">
          ৳{n(low)} – ৳{n(high)}
        </p>
      </div>

      <div className="relative mt-5 h-5">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ivory-300" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,var(--color-lotus-500),var(--color-saffron))]" style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={low}
          onChange={(event) => setLow(Math.min(Number(event.target.value), high - step))}
          onPointerUp={() => commit()}
          onKeyUp={() => commit()}
          aria-label={t.min}
          className={`${thumb} ${low > max - (max - min) / 10 ? "z-20" : "z-10"}`}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={(event) => setHigh(Math.max(Number(event.target.value), low + step))}
          onPointerUp={() => commit()}
          onKeyUp={() => commit()}
          aria-label={t.max}
          className={`${thumb} z-10`}
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        {[
          [low, setLow, t.min, (value) => commit(value, high)],
          [high, setHigh, t.max, (value) => commit(low, value)],
        ].map(([value, set, label, done], i) => (
          <label key={label} className={`flex-1 rounded-xl border border-ivory-300 bg-white px-3 py-1.5 focus-within:border-navy-900 ${i === 1 ? "order-3" : ""}`}>
            <span className="block text-[10px] tracking-[0.14em] text-ink/50 uppercase">{label}</span>
            <span className="flex items-center gap-1 text-sm text-navy-900">
              ৳
              <input
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                value={value}
                onChange={(event) => set(event.target.value)}
                onBlur={(event) => done(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), done(event.currentTarget.value))}
                className="w-full bg-transparent tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </span>
          </label>
        ))}
        <span className="order-2 text-ink/40">–</span>
      </div>
    </div>
  );
}
