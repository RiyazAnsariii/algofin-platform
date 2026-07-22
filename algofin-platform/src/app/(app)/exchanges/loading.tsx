"use client";

import { useDelayedLoading } from "@/hooks/useDelayedLoading";

// src/app/(app)/exchanges/loading.tsx
export default function ExchangesLoading() {
  const show = useDelayedLoading(true, 200);
  if (!show) return null;

  return (
    <div className="flex flex-col gap-6 p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-44" />
        <div className="skeleton h-9 w-36" />
      </div>

      {/* Exchange cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="surface-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="skeleton h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <div className="skeleton h-4 w-24" />
                <div className="skeleton h-3 w-16" />
              </div>
              <div className="ml-auto skeleton h-5 w-14 rounded-full" />
            </div>
            <div className="space-y-2 pt-2 border-t border-white/5">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="flex justify-between">
                  <div className="skeleton h-3 w-20" />
                  <div className="skeleton h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
