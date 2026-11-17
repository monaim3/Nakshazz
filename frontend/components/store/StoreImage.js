/**
 * Product/banner image using the three WebP sizes the API generates (400/800/1600px).
 * The browser downloads only the size it needs; below-the-fold images load lazily.
 */
export default function StoreImage({ urls, alt = "", sizes = "(min-width: 1024px) 25vw, 50vw", priority = false, className = "" }) {
  if (!urls) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- images are pre-optimised WebP from the API
    <img
      src={urls.md}
      srcSet={`${urls.sm} 400w, ${urls.md} 800w, ${urls.lg} 1600w`}
      sizes={sizes}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={className}
    />
  );
}
