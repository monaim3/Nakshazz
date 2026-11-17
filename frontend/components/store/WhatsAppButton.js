/** WhatsApp logo (brand icon; lucide has none). */
function WhatsAppIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm.01 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.2 8.2 0 0 1 8.23 8.24c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.29Z" />
    </svg>
  );
}

/**
 * Floating WhatsApp icon button (bottom-right, every storefront page). Opens WhatsApp with
 * a short greeting. `number` is the local BD number from store settings (e.g. 01567910032).
 */
export default function WhatsAppButton({ number, label, greeting }) {
  const digits = String(number || "").replace(/\D/g, "").replace(/^88/, "");
  if (digits.length < 10) return null;
  const href = `https://wa.me/88${digits}?text=${encodeURIComponent(greeting)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      className="group fixed right-4 bottom-4 z-40 flex items-center justify-center rounded-full bg-[#25d366] p-3.5 text-white shadow-[0_10px_30px_-6px_rgba(37,211,102,0.65)] transition hover:-translate-y-0.5 hover:bg-[#1ebe5b] sm:right-6 sm:bottom-6"
    >
      {/* soft pulse ring to draw the eye */}
      <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[#25d366]/40 [animation-duration:2.4s] motion-reduce:hidden" aria-hidden />
      <WhatsAppIcon className="size-7" />
    </a>
  );
}
