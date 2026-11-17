import { Suspense } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { LoadingBlock } from "@/components/admin/ui";

export const instant = false;

export default function PanelLayout({ children }) {
  return (
    <AdminShell>
      <Suspense fallback={<LoadingBlock />}>{children}</Suspense>
    </AdminShell>
  );
}
