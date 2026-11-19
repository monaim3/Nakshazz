"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import OrderDetails from "./OrderDetails";

const API = process.env.NEXT_PUBLIC_API_URL;

/** Order number + phone lookup (both must match; the server rate-limits attempts). */
export default function TrackOrderForm({ lang, t }) {
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setOrder(null);
    setLoading(true);
    try {
      const response = await fetch(`${API}/orders/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ order_number: number.trim(), phone: phone.replace(/[\s-]/g, "") }),
      });
      if (response.ok) setOrder((await response.json()).data);
      else setError(response.status === 429 ? t.tooMany : t.notFound);
    } catch {
      setError(t.networkError);
    } finally {
      setLoading(false);
    }
  }

  const field = "h-12 w-full rounded-xl border border-ivory-300 bg-white px-4 text-sm outline-none transition focus:border-navy-900";

  return (
    <div>
      <form onSubmit={submit} className="grid gap-4 rounded-3xl bg-white p-6 shadow-[0_10px_40px_-20px_rgba(15,27,53,0.25)] ring-1 ring-ivory-200 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="track-number" className="mb-1.5 block text-sm font-medium text-navy-900">
            {t.orderNumber}
          </label>
          <input id="track-number" required value={number} onChange={(event) => setNumber(event.target.value.toUpperCase())} placeholder="NK100001" maxLength={20} className={`${field} uppercase`} />
        </div>
        <div>
          <label htmlFor="track-phone" className="mb-1.5 block text-sm font-medium text-navy-900">
            {t.phone}
          </label>
          <input id="track-phone" required type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01XXXXXXXXX" maxLength={20} className={field} />
        </div>
        <button type="submit" disabled={loading} className="flex h-12 items-center justify-center gap-2 rounded-full bg-navy-900 px-7 text-sm font-medium text-white disabled:opacity-60">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} {t.trackButton}
        </button>
      </form>
      {error && (
        <p className="mt-4 text-center text-sm text-lotus-600" role="alert">
          {error}
        </p>
      )}
      {order && (
        <div className="mt-8">
          <OrderDetails order={order} lang={lang} t={t} />
        </div>
      )}
    </div>
  );
}
