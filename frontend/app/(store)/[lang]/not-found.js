import NotFoundContent from "@/components/store/NotFoundContent";

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/** Branded 404 inside the store layout (unknown product, category, page or address). */
export default function NotFound() {
  return <NotFoundContent />;
}
