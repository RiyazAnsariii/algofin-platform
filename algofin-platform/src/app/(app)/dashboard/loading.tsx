// src/app/(app)/dashboard/loading.tsx
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 rounded-lg bg-muted/30 animate-pulse" />
        <div className="h-8 w-28 rounded-lg bg-muted/20 animate-pulse" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="surface-card p-5 space-y-3">
            <div className="h-3 w-24 rounded bg-muted/30 animate-pulse" />
            <div className="h-7 w-28 rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-16 rounded bg-muted/20 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Positions table */}
      <div className="surface-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 rounded bg-muted/30 animate-pulse" />
          <div className="h-4 w-20 rounded bg-muted/20 animate-pulse" />
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 items-center py-3 border-b border-white/5">
              <div className="h-4 w-16 rounded bg-muted/30 animate-pulse" />
              <div className="h-5 w-12 rounded-full bg-muted/20 animate-pulse" />
              <div className="h-4 w-24 rounded bg-muted/30 animate-pulse" />
              <div className="h-4 w-20 rounded bg-muted/30 animate-pulse ml-auto" />
              <div className="h-4 w-20 rounded bg-muted/20 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
