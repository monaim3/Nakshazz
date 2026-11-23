"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BadgeDollarSign, Boxes, ChartColumn, FolderTree, Gem, Image as ImageIcon, LayoutDashboard, LogOut,
  Mail, Menu, Receipt, Settings, ShoppingBag, Star, Tag, Users, UserCog, Wallet, X, ClipboardPlus,
} from "lucide-react";
import { adminApi, useAlertsQuery, useLogoutMutation, useMeQuery } from "@/store/admin/api";
import { useDispatch } from "react-redux";
import { cx, LoadingBlock, useToast } from "./ui";

const NAV = [
  { section: "Sell" },
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag, alert: "pending_orders" },
  { href: "/admin/sales/new", label: "New sale", icon: ClipboardPlus },
  { href: "/admin/payments", label: "bKash verify", icon: Wallet, alert: "bkash_to_verify" },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { section: "Catalog" },
  { href: "/admin/products", label: "Products", icon: Gem },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes },
  { section: "Website" },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/content", label: "Banners & pages", icon: ImageIcon },
  { href: "/admin/messages", label: "Messages", icon: Mail, alert: "unread_messages" },
  { section: "Business", ownerOnly: true },
  { href: "/admin/reports", label: "Sales & profit", icon: ChartColumn, ownerOnly: true },
  { href: "/admin/expenses", label: "Expenses", icon: Receipt, ownerOnly: true },
  { href: "/admin/coupons", label: "Coupons", icon: Tag, ownerOnly: true },
  { href: "/admin/staff", label: "Staff", icon: UserCog, ownerOnly: true },
  { href: "/admin/settings", label: "Settings", icon: Settings, ownerOnly: true },
];

export default function AdminShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data, error, isLoading } = useMeQuery();
  const [logout] = useLogoutMutation();
  const user = data?.data;
  const isOwner = Boolean(user?.permissions?.view_financials);
  const alerts = useNewOrderAlerts(Boolean(user), pathname);

  useEffect(() => {
    if (error?.status === 401 || error?.status === 403) {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [error, pathname, router]);

  async function handleLogout() {
    try {
      await logout().unwrap();
    } finally {
      dispatch(adminApi.util.resetApiState());
      router.replace("/admin/login");
    }
  }

  if (isLoading || !user) {
    return <div className="min-h-screen bg-cream-50">{error && error.status !== 401 ? <p className="p-8 text-center text-sm text-red-600">{error.message}</p> : <LoadingBlock />}</div>;
  }

  const isActive = (item) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4" aria-label="Admin">
      {NAV.filter((item) => !item.ownerOnly || isOwner).map((item, index) =>
        item.section ? (
          <p key={`s-${index}`} className="mt-5 mb-1 px-3 text-[11px] font-semibold tracking-widest text-ink-400 uppercase first:mt-2">
            {item.section}
          </p>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item) ? "page" : undefined}
            onClick={() => setDrawerOpen(false)}
            className={cx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive(item) ? "bg-ink-900 font-medium text-cream-50" : "text-ink-600 hover:bg-cream-200 hover:text-ink-900",
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            {item.label}
            {item.alert && alerts?.[item.alert] > 0 && (
              <span className="ml-auto min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] leading-5 font-semibold text-white" aria-label={`${alerts[item.alert]} waiting`}>
                {alerts[item.alert] > 99 ? "99+" : alerts[item.alert]}
              </span>
            )}
          </Link>
        ),
      )}
    </nav>
  );

  const userBox = (
    <div className="border-t border-ink-100 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-gold-300/40 text-sm font-semibold text-gold-700">{user.name?.[0]?.toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">{user.name}</p>
          <p className="truncate text-xs text-ink-400 capitalize">{user.role}</p>
        </div>
        <button type="button" onClick={handleLogout} className="rounded-md p-1.5 text-ink-400 hover:bg-cream-200 hover:text-ink-800" aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );

  const brand = (
    <Link href="/admin" className="flex items-baseline gap-2 px-6 py-5">
      <span className="font-display text-2xl text-ink-900">Nakshazz</span>
      <span className="text-[10px] font-semibold tracking-[0.2em] text-gold-600 uppercase">Admin</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-ink-100 bg-white lg:flex">
        {brand}
        {nav}
        {userBox}
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-100 bg-white/95 px-4 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setDrawerOpen(true)} className="relative -ml-2 rounded-md p-2 text-ink-700" aria-label={alerts?.total ? `Open menu, ${alerts.total} waiting` : "Open menu"}>
          <Menu className="size-5" />
          {alerts?.total > 0 && <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-red-600 ring-2 ring-white" />}
        </button>
        <span className="font-display text-xl text-ink-900">Nakshazz</span>
        <Link href="/admin/sales/new" className="-mr-2 rounded-md p-2 text-gold-600" aria-label="New sale">
          <BadgeDollarSign className="size-5" />
        </Link>
      </header>

      {drawerOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-ink-900/40" aria-label="Close menu" onClick={() => setDrawerOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[85%] animate-fade-in flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-md p-2 text-ink-500" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {userBox}
          </aside>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

/**
 * Counts for the sidebar badges, refreshed every minute (also while the tab is in the
 * background). Puts the total in the browser tab title, and when a new order arrives shows
 * a toast and plays a short chime, so a shop that keeps the panel open never misses one.
 */
function useNewOrderAlerts(enabled, pathname) {
  const { notify } = useToast();
  const { data } = useAlertsQuery(undefined, { skip: !enabled, pollingInterval: 60_000 });
  const lastOrderId = useRef(null);
  const counts = data?.data;
  const total = counts ? counts.pending_orders + counts.bkash_to_verify + counts.unread_messages : 0;

  useEffect(() => {
    if (!counts) return;
    if (lastOrderId.current !== null && counts.latest_order_id > lastOrderId.current) {
      notify("New order received — see Orders");
      chime();
    }
    lastOrderId.current = counts.latest_order_id;
  }, [counts, notify]);

  // the page sets its own title on navigation: re-apply the count after it
  useEffect(() => {
    const id = setTimeout(() => {
      const base = document.title.replace(/^\(\d+\+?\) /, "");
      document.title = total > 0 ? `(${total > 99 ? "99+" : total}) ${base}` : base;
    }, 50);
    return () => clearTimeout(id);
  }, [total, pathname]);

  return counts ? { ...counts, total } : null;
}

/** Two soft notes. Browsers only allow sound after the user has clicked on the page. */
function chime() {
  try {
    const audio = new AudioContext();
    [660, 880].forEach((frequency, i) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, audio.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + i * 0.18 + 0.35);
      tone.connect(gain).connect(audio.destination);
      tone.start(audio.currentTime + i * 0.18);
      tone.stop(audio.currentTime + i * 0.18 + 0.4);
    });
    setTimeout(() => audio.close(), 1000);
  } catch {
    // no sound available: the toast and the badge still show it
  }
}

/** Hide owner-only content from staff (the API enforces it too). */
export function useIsOwner() {
  const { data } = useMeQuery();
  return Boolean(data?.data?.permissions?.view_financials);
}
