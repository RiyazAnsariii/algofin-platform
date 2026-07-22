// src/hooks/useApiWarmup.ts
// Detects when the Render backend is cold-starting and shows a warm-up banner.
// Polls /api/v1/health every 3 seconds until it gets a 200 response.

"use client";

import { useEffect, useState, useCallback } from "react";

export type WarmupState = "idle" | "warming" | "ready" | "failed";

const HEALTH_URL = "/api/v1/health";
const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 60_000; // give up after 60s

export function useApiWarmup() {
  const [state, setState] = useState<WarmupState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(HEALTH_URL, {
        method: "GET",
        cache:  "no-store",
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let startTime = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;

      const elapsed = Date.now() - startTime;
      setElapsedMs(elapsed);

      if (elapsed > MAX_WAIT_MS) {
        setState("failed");
        return;
      }

      const healthy = await checkHealth();
      if (cancelled) return;

      if (healthy) {
        setState("ready");
      } else {
        setState("warming");
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    // Kick off immediately
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checkHealth]);

  return { state, elapsedMs };
}
