// src/hooks/useDelayedLoading.ts
// Returns true ONLY if loading has lasted longer than `delay` ms.
// This prevents skeleton flash on fast API responses (< 200ms).
//
// Usage:
//   const showSkeleton = useDelayedLoading(loading);
//   {loading && showSkeleton && <Skeleton />}   ← skeleton (strictly during load)
//   {!loading && <Content />}                   ← content (strictly after load)
//
// Fast load (< 200ms): content appears directly, no skeleton shown.
// Slow load (> 200ms): skeleton appears, then content fades in.
//
// IMPORTANT: The hook initialises from `loading` synchronously to prevent
// the one-render-frame race where loading=false && showSkeleton=true
// overlap due to React batching effect cleanup after state updates.

"use client";

import { useEffect, useRef, useState } from "react";

export function useDelayedLoading(loading: boolean, delay = 300): boolean {
  // Track whether the delay has elapsed while loading is still true.
  // We never allow showSkeleton=true when loading=false, so the two
  // conditions (loading && showSkeleton) and (!loading) are always
  // mutually exclusive — even across React render cycles.
  const [showSkeleton, setShowSkeleton] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading) {
      // Clear any pending timer immediately
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Synchronously suppress skeleton — no frame where loading=false and showSkeleton=true
      setShowSkeleton(false);
      return;
    }

    // loading just became true — start the delay timer
    timerRef.current = setTimeout(() => {
      setShowSkeleton(true);
      timerRef.current = null;
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [loading, delay]);

  // Belt-and-suspenders: never return true when loading is false
  return loading && showSkeleton;
}
