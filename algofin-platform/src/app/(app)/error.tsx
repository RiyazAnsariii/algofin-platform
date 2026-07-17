"use client"

import { useEffect } from "react"

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("App error boundary caught:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-5">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-destructive">
          <circle cx="12" cy="12" r="10" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-1">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">
        This section encountered an error. Try refreshing or come back later.
      </p>
      <button
        onClick={reset}
        className="inline-flex h-9 items-center justify-center rounded-full bg-primary text-primary-foreground px-4 text-sm font-medium hover:bg-primary/80 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
