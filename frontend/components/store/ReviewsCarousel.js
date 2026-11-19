"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

const AUTOPLAY_MS = 6000;

/**
 * 3D cover-flow review carousel: the active card faces the viewer, its neighbours turn away
 * in perspective with a lotus tint. Arrows, dots, keyboard, swipe; autoplay pauses on hover.
 */
export default function ReviewsCarousel({ reviews, t }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef(null);
  const count = reviews.length;

  useEffect(() => {
    if (paused || count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = setTimeout(() => setActive((current) => (current + 1) % count), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [active, paused, count]);

  if (count === 0) return null;
  const go = (step) => setActive((current) => (current + step + count) % count);

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") go(-1);
        if (event.key === "ArrowRight") go(1);
      }}
      onTouchStart={(event) => {
        touchX.current = event.touches[0].clientX;
        setPaused(true);
      }}
      onTouchEnd={(event) => {
        const dx = event.changedTouches[0].clientX - (touchX.current ?? 0);
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
      aria-roledescription="carousel"
      aria-label={t.reviews.replace(/\*/g, "")}
    >
      <div className="relative mx-auto h-[320px] max-w-5xl [perspective:1400px] sm:h-[340px]">
        {reviews.map((review, index) => {
          // signed distance from the active card, wrapped around: -1 left, 0 centre, 1 right
          let offset = (index - active + count) % count;
          if (offset > count / 2) offset -= count;
          const visible = Math.abs(offset) <= 1;
          const center = offset === 0;
          const bangla = /[ঀ-৿]/.test(review.comment);

          return (
            <article
              key={review.id}
              aria-hidden={!center}
              onClick={() => !center && setActive(index)}
              className={`absolute top-1/2 left-1/2 flex h-[290px] w-[86%] max-w-[400px] flex-col rounded-3xl border p-7 transition-all duration-700 ease-[cubic-bezier(.22,.8,.24,1)] sm:h-[300px] sm:w-[380px] ${
                center ? "z-20 cursor-default border-white/15 bg-navy-900 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.7)]" : "z-10 cursor-pointer border-white/10 bg-[linear-gradient(135deg,rgba(209,30,88,0.28),rgba(15,27,53,0.9)_75%)]"
              } ${visible ? "" : "pointer-events-none opacity-0"}`}
              style={{
                transform: `translate(-50%, -50%) translateX(${offset * 92}%) translateZ(${center ? 0 : -160}px) rotateY(${offset * -24}deg) scale(${center ? 1 : 0.9})`,
                opacity: visible ? (center ? 1 : 0.75) : 0,
              }}
            >
              <div className="flex items-center gap-4">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-gold-light),var(--color-saffron))] font-display text-2xl text-navy-950 ring-4 ring-white/10">
                  {review.customer_name.charAt(0)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold text-white">{review.customer_name}</span>
                  <span className="block text-xs text-white/55">{review.source === "facebook" ? t.reviewsSource : t.reviewsVerified}</span>
                </span>
              </div>
              <div className="mt-4 flex gap-1" aria-label={`${review.rating} / 5`}>
                {Array.from({ length: 5 }, (_, star) => (
                  <Star key={star} className={`size-5 ${star < review.rating ? "fill-marigold-400 text-marigold-400" : "text-white/20"}`} aria-hidden />
                ))}
              </div>
              <blockquote lang={bangla ? "bn" : undefined} className={`mt-4 overflow-hidden leading-relaxed text-white/85 ${center ? "line-clamp-6" : "line-clamp-4 text-sm"} ${bangla ? "font-bangla" : ""}`}>
                “{review.comment}”
              </blockquote>
            </article>
          );
        })}

        {count > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label={t.previous} className="absolute top-1/2 left-0 z-30 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-navy-950/80 text-white shadow-[0_0_25px_rgba(209,30,88,0.35)] backdrop-blur transition hover:bg-lotus-500 sm:left-4 sm:flex">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label={t.next} className="absolute top-1/2 right-0 z-30 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-navy-950/80 text-white shadow-[0_0_25px_rgba(209,30,88,0.35)] backdrop-blur transition hover:bg-lotus-500 sm:right-4 sm:flex">
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {reviews.map((review, index) => (
            <button
              key={review.id}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`${index + 1} / ${count}`}
              aria-current={index === active}
              className={`h-2 rounded-full transition-all duration-500 ${index === active ? "w-8 bg-gold-light" : "w-2 bg-white/30 hover:bg-white/60"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
