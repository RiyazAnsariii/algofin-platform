// src/app/(app)/exchanges/loading.tsx
export default function ExchangesLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 rounded-lg bg-muted/30 animate-pulse" />
        <div className="h-9 w-36 rounded-lg bg-muted/20 animate-pulse" />
      </div>

      {/* Exchange cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="surface-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted/30 animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-muted/30 animate-pulse" />
                <div className="h-3 w-16 rounded bg-muted/20 animate-pulse" />
              </div>
              <div className="ml-auto h-5 w-14 rounded-full bg-muted/20 animate-pulse" />
            </div>
            <div className="space-y-2 pt-2 border-t border-white/5">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="flex justify-between">
                  <div className="h-3 w-20 rounded bg-muted/20 animate-pulse" />
                  <div className="h-3 w-24 rounded bg-muted/30 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
