import { Suspense } from "react";
import { Cormorant_Garamond, Inter } from "next/font/google";
import AdminStoreProvider from "@/components/admin/AdminStoreProvider";
import { LoadingBlock, ToastProvider } from "@/components/admin/ui";
import "../globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

/** Login-gated client area: instant-navigation prerender checks don't apply. */
export const instant = false;

export const metadata = {
  title: { default: "Admin", template: "%s · Nakshazz Admin" },
  robots: { index: false, follow: false },
};

/**
 * Admin root layout (separate from the storefront so shoppers never download admin code).
 * Private and per-user, so it renders at request time inside Suspense.
 */
export default function AdminLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable} h-full`}>
      <body suppressHydrationWarning className="min-h-full">
        <Suspense fallback={<LoadingBlock />}>
          <AdminStoreProvider>
            <ToastProvider>{children}</ToastProvider>
          </AdminStoreProvider>
        </Suspense>
      </body>
    </html>
  );
}
