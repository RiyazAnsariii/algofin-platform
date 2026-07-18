"use client"

import { useEffect } from "react"
import Link from "next/link"

export default function AuthError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("Auth error boundary caught:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center text-center py-16">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-5">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-destructive">
          <circle cx="12" cy="12" r="10" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-1">Authentication error</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Something went wrong. Please try signing in again.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex h-9 items-center justify-center rounded-full bg-primary text-primary-foreground px-4 text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          Try again
        </button>
        <Link
          href="/login"
          className="inline-flex h-9 items-center justify-center rounded-full border border-border text-foreground px-4 text-sm font-medium hover:bg-muted transition-colors"
        >
          Sign in
        </Link>
      </div>
    </div>
  )
}
