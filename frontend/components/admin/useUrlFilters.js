"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * List filters stored in the URL, so filtered views can be bookmarked,
 * shared, and linked to (e.g. dashboard → "pending orders").
 */
export function useUrlFilters(keys) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo(() => Object.fromEntries(keys.map((key) => [key, searchParams.get(key) || ""])), [keys, searchParams]);

  const setFilters = useCallback(
    (changes) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(changes).forEach(([key, value]) => {
        if (value === "" || value === null || value === undefined) next.delete(key);
        else next.set(key, String(value));
      });
      if (!("page" in changes)) next.delete("page");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return [filters, setFilters];
}
