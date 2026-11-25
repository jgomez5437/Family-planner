"use client";

import { useEffect, useState } from "react";

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}

/**
 * Triggers periodic re-renders (and immediately on mount / window focus /
 * visibility return) so relative timestamps and local-timezone clocks stay
 * fresh and never remain stuck with SSR UTC text.
 */
export function useRelativeTimeTicker(intervalMs = 30000): number {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const update = () => setNowMs(Date.now());
    update();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        update();
      }
    }, intervalMs);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        update();
      }
    };

    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs]);

  return nowMs;
}
