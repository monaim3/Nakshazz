"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Product photos: large image with hover zoom (desktop) that follows the pointer,
 * swipeable strip on phones, thumbnails below. First image loads eagerly (LCP).
 */
export default function ProductGallery({ images, name, productId }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(null); // {x, y} in % while hovering
  const stripRef = useRef(null);

  // Picking a colour shows the first photo linked to that variant (if one is linked)
  useEffect(() => {
    const onVariant = (event) => {
      if (event.detail?.productId !== productId) return;
      // that colour's photo, else back to the first general (all-colours) photo
      let target = images.findIndex((image) => image.variant_id === event.detail.variantId);
      if (target < 0) target = Math.max(0, images.findIndex((image) => !image.variant_id));
      setIndex(target);
      const strip = stripRef.current;
      if (strip && strip.offsetParent) strip.scrollTo({ left: target * strip.clientWidth, behavior: "smooth" });
    };
    window.addEventListener("nakshazz-variant-change", onVariant);
    return () => window.removeEventListener("nakshazz-variant-change", onVariant);
  }, [images, productId]);
  const current = images[index];

  if (!current) {
    return <div className="aspect-[4/5] rounded-3xl bg-ivory-200" />;
  }

  return (
    <div className="lg:sticky lg:top-36">
      {/* Phones: horizontal swipe with snap */}
      <div ref={stripRef} className="scrollbar-none -mx-4 flex snap-x snap-mandatory overflow-x-auto sm:hidden" onScroll={(event) => setIndex(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}>
        {images.map((image, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- optimised WebP from the API
          <img key={image.id} src={image.urls.lg} srcSet={`${image.urls.md} 800w, ${image.urls.lg} 1600w`} sizes="100vw" alt={image.alt || name} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} className="aspect-[4/5] w-full shrink-0 snap-center object-cover" />
        ))}
      </div>

      {/* Tablet/desktop: zoom on hover */}
      <div
        className="relative hidden aspect-[4/5] cursor-zoom-in overflow-hidden rounded-3xl bg-ivory-100 sm:block"
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setZoom({ x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 });
        }}
        onMouseLeave={() => setZoom(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- optimised WebP from the API */}
        <img
          key={current.id}
          src={current.urls.lg}
          srcSet={`${current.urls.md} 800w, ${current.urls.lg} 1600w`}
          sizes="(min-width: 1024px) 50vw, 90vw"
          alt={current.alt || name}
          fetchPriority={index === 0 ? "high" : undefined}
          className="size-full animate-fade-in object-cover transition-transform duration-200 ease-out"
          style={zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
        />
      </div>

      {images.length > 1 && (
        <>
          <div className="mt-3 flex justify-center gap-1.5 sm:hidden" aria-hidden>
            {images.map((image, i) => (
              <span key={image.id} className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-navy-900" : "w-1.5 bg-navy-900/25"}`} />
            ))}
          </div>
          <div className="mt-4 hidden gap-3 sm:flex">
            {images.map((image, i) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`${i + 1} / ${images.length}`}
                aria-current={i === index}
                className={`size-20 overflow-hidden rounded-2xl border-2 transition ${i === index ? "border-navy-900" : "border-transparent opacity-70 hover:opacity-100"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail */}
                <img src={image.urls.sm} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
