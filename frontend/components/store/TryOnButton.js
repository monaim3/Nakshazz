"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Sparkles } from "lucide-react";

// the try-on (and its face model) loads only when a customer opens it
const TryOn = dynamic(() => import("./TryOn"), { ssr: false });

export default function TryOnButton({ product, t }) {
  const [open, setOpen] = useState(false);
  if (!product.tryon) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-full border border-dashed border-lotus-400 bg-lotus-50 text-sm font-medium text-lotus-700 transition hover:border-solid hover:bg-lotus-100"
      >
        <Sparkles className="size-4 transition group-hover:rotate-12" /> {t.button}
      </button>
      {open && <TryOn product={product} t={t} onClose={() => setOpen(false)} />}
    </>
  );
}
