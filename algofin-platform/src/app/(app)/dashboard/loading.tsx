"use client";

import { useDelayedLoading } from "@/hooks/useDelayedLoading";

// src/app/(app)/dashboard/loading.tsx
export default function DashboardLoading() {
  const show = useDelayedLoading(true, 200);
  if (!show) return null;

  return (
    <div className="flex flex-col gap-6 p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-44" />
        <div className="skeleton h-8 w-28" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="surface-card p-5 space-y-3">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-7 w-28" />
            <div className="skeleton h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Positions table */}
      <div className="surface-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="skeleton h-5 w-32" />
          <div className="skeleton h-4 w-20" />
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
