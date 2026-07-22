// src/hooks/useApiWarmup.ts
// Detects when the Render backend is cold-starting and shows a warm-up banner.
// Polls /api/v1/ping (fast endpoint, no DB query) through Next.js proxy every 3s.

"use client";

import { useEffect, useState, useCallback } from "react";

export type WarmupState = "idle" | "warming" | "ready" | "failed";

// /api/v1/ping goes through Next.js rewrite -> backend /api/v1/ping
// This is a fast endpoint that returns instantly (no DB/Redis queries)
const HEALTH_URL = "/api/v1/ping";
const POLL_INTERVAL_MS = 4000;
const MAX_WAIT_MS = 180_000; // 3 minutes — Render cold start can take up to 2 min

export function useApiWarmup() {
  const [state, setState] = useState<WarmupState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const retry = useCallback(() => {
    setElapsedMs(0);
    setState("warming");
    setRetryTrigger((n) => n + 1);
  }, []);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(HEALTH_URL, {
        method: "GET",
        cache:  "no-store",
        signal: AbortSignal.timeout(6000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const startTime = Date.now();
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

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkHealth, retryTrigger]);

  return { state, elapsedMs, retry };
}
