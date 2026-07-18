"use client"

import { useEffect } from "react"
import Link from "next/link"

export default function RootError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("Root error boundary caught:", error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-6">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-destructive">
          <circle cx="12" cy="12" r="10" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">Something went wrong</h1>
      <p className="text-sm text-muted-foreground mb-8 text-center max-w-sm">
        An unexpected error occurred. Please try again or contact support if the issue persists.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex h-9 items-center justify-center rounded-full bg-primary text-primary-foreground px-4 text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-input/30 text-foreground px-4 text-sm font-medium hover:bg-input/50 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
