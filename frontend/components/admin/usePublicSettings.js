"use client";

import { useEffect, useState } from "react";

let cache = null;

/** Public store settings (delivery zones, payment options, contact details). Cached per page load. */
export function usePublicSettings() {
  const [settings, setSettings] = useState(cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        cache = json?.data || { store: {}, delivery_zones: [], payment_methods: [] };
        if (!cancelled) setSettings(cache);
      })
      .catch(() => !cancelled && setSettings({ store: {}, delivery_zones: [], payment_methods: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  return settings;
}
