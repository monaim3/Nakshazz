"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Info } from "lucide-react";
import { openCartDrawer } from "@/lib/cart-storage";

const EVENT = "nakshazz-toast";

/** Show a short message at the bottom of the shop. `bagLink` adds a "View bag" button. */
export function showStoreToast({ title, text = "", image = null, tone = "success", bagLink = false }) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { title, text, image, tone, bagLink } }));
}

/** Mounted once in the store layout; shows one toast at a time, newest replaces the last. */
export default function StoreToaster({ viewBagLabel }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    function onToast(event) {
      clearTimeout(timer.current);
      setToast({ ...event.detail, key: Date.now() });
      timer.current = setTimeout(() => setToast(null), 3000);
    }
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      clearTimeout(timer.current);
    };
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
      {toast && (
        <div
          key={toast.key}
          className="toast-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-navy-900 p-3 pr-4 text-white shadow-[0_18px_40px_-12px_rgba(15,23,42,0.6)]"
        >
          {toast.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- small product thumbnail from the API
            <img src={toast.image} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
          ) : toast.tone === "info" ? (
            <Info className="size-5 shrink-0 text-marigold-300" />
          ) : (
            <CheckCircle2 className="size-5 shrink-0 text-marigold-300" />
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              {toast.image && toast.tone !== "info" && <CheckCircle2 className="size-4 shrink-0 text-marigold-300" />}
              {toast.title}
            </p>
            {toast.text && <p className="truncate text-xs text-white/70">{toast.text}</p>}
          </div>
          {toast.bagLink && (
            <button
              type="button"
              onClick={() => {
                setToast(null);
                openCartDrawer();
              }}
              className="shrink-0 rounded-full border border-white/30 px-3 py-1.5 text-xs font-medium transition hover:bg-white hover:text-navy-900"
            >
              {viewBagLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
