"use client";

import { useEffect, useState } from "react";

/**
 * Triggers periodic re-renders (and immediately on window focus / visibility
 * return) so relative timestamps like "Just Now", "5m", "1hr", "1d" stay
 * fresh without requiring a manual refresh.
 */
export function useRelativeTimeTicker(intervalMs = 30000): number {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const update = () => setNowMs(Date.now());
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
