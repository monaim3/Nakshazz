"use client";

import Link from "next/link";
import { ChevronRight, PackageCheck } from "lucide-react";
import { forgetRecentOrders, useRecentOrders } from "@/lib/recent-orders-storage";
import { localePath, localizeDigits } from "@/lib/i18n";
import { formatPrice } from "./Price";

/** "Your orders on this device": the orders placed from this browser, one tap to open. */
export default function RecentOrders({ lang }) {
  const orders = useRecentOrders();
  if (orders.length === 0) return null;

  const bn = lang === "bn";
  const date = (iso) => {
    try {
      return localizeDigits(new Intl.DateTimeFormat(bn ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)), lang);
    } catch {
      return "";
    }
  };

  return (
    <section className="mb-8 rounded-3xl bg-white p-6 shadow-[0_10px_40px_-20px_rgba(15,27,53,0.25)] ring-1 ring-ivory-200">
      <div className="mb-3 flex items-center gap-2">
        <PackageCheck className="size-5 text-lotus-600" />
        <h2 className="font-display text-2xl text-navy-900">{bn ? "এই ডিভাইসে আপনার অর্ডার" : "Your orders on this device"}</h2>
      </div>
      <p className="mb-4 text-sm text-ink/60">{bn ? "অর্ডার নম্বর মনে রাখার দরকার নেই, নিচে চাপলেই খুলবে।" : "No need to remember the order number: tap one to open it."}</p>
      <ul className="divide-y divide-ivory-200">
        {orders.map((order) => (
          <li key={order.uuid}>
            <Link href={localePath(lang, `/order/${order.uuid}`)} className="flex items-center justify-between gap-3 py-3 text-sm transition hover:text-lotus-600">
              <span>
                <span className="block font-medium text-navy-900">{order.order_number}</span>
                <span className="block text-xs text-ink/55">{date(order.placed_at)}</span>
              </span>
              <span className="flex items-center gap-2">
                {order.grand_total && <span className="font-medium tabular-nums">{formatPrice(order.grand_total, lang)}</span>}
                <ChevronRight className="size-4 text-ink/40" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <button type="button" onClick={forgetRecentOrders} className="mt-3 text-xs text-ink/50 underline-offset-2 hover:underline">
        {bn ? "এই ডিভাইস থেকে তালিকা মুছে দিন" : "Clear this list from this device"}
      </button>
    </section>
  );
}
