import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-6">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">Page not found</h1>
      <p className="text-sm text-muted-foreground mb-8 text-center max-w-sm">
        This page doesn&apos;t exist or has been moved. If you think this is a mistake, contact support.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex h-9 items-center justify-center rounded-full bg-primary text-primary-foreground px-4 text-sm font-medium hover:bg-primary/80 transition-colors"
      >
        Back to dashboard
      </Link>
    </div>
  )
}
