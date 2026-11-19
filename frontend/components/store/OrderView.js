"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle } from "lucide-react";
import { localePath } from "@/lib/i18n";
import OrderDetails from "./OrderDetails";

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * Order confirmation / status page, loaded in the browser from the private order link
 * (/order/{uuid}). Never cached or indexed: it holds the customer's order.
 */
export default function OrderView({ uuid, placed, lang, t, whatsapp }) {
  const [order, setOrder] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/orders/${encodeURIComponent(uuid)}`, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then(({ data }) => setOrder(data))
      .catch((reason) => reason.name !== "AbortError" && setFailed(true));
    return () => controller.abort();
  }, [uuid]);

  if (failed) {
    return (
      <div className="py-20 text-center">
        <p className="font-display text-2xl text-navy-900">{t.notFound}</p>
        <Link href={localePath(lang, "/track-order")} className="mt-6 inline-block rounded-full bg-navy-900 px-8 py-3 text-sm text-white">
          {t.trackTitle.replace(/\*/g, "")}
        </Link>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-8 animate-spin text-marigold-600" />
      </div>
    );
  }

  const message = encodeURIComponent(t.whatsappMessage.replace(":number", order.order_number));

  return (
    <div>
      {placed && (
        <div className="mb-8 text-center">
          <CheckCircle2 className="mx-auto size-16 animate-fade-in text-teal-500" strokeWidth={1.5} />
          <h1 className="mt-4 font-display text-4xl text-navy-900 sm:text-5xl">{t.thanks.replace(":name", order.customer_name.split(" ")[0])}</h1>
          <p className="mx-auto mt-3 max-w-md text-ink/65">{order.payment_method === "bkash" ? t.placedBkash : t.placedCod}</p>
        </div>
      )}
      <OrderDetails order={order} lang={lang} t={t} />
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={localePath(lang, "/shop")} className="rounded-full bg-navy-900 px-8 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5">
          {t.continueShopping}
        </Link>
        {whatsapp && (
          <a href={`https://wa.me/88${whatsapp}?text=${message}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border border-[#25d366] px-6 py-3 text-sm font-medium text-[#128c4b] transition hover:bg-[#25d366] hover:text-white">
            <MessageCircle className="size-4" /> {t.askWhatsapp}
          </a>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-ink/50">{t.saveLink}</p>
    </div>
  );
}
