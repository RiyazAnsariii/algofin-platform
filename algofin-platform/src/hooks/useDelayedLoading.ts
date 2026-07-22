// src/hooks/useDelayedLoading.ts
// Returns true ONLY if loading has lasted longer than `delay` ms.
// This prevents skeleton flash on fast API responses (< 200ms).
//
// Usage:
//   const showSkeleton = useDelayedLoading(loading);
//   {showSkeleton ? <Skeleton /> : <Content />}
//
// Fast load (< 200ms): content appears directly, no skeleton shown.
// Slow load (> 200ms): skeleton appears, then content fades in.

"use client";

import { useEffect, useState } from "react";

export function useDelayedLoading(loading: boolean, delay = 200): boolean {
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false);
      return;
    }
    // Only show skeleton if loading takes longer than `delay` ms
    const timer = setTimeout(() => setShowSkeleton(true), delay);
    return () => clearTimeout(timer);
  }, [loading, delay]);

  return showSkeleton;
}
