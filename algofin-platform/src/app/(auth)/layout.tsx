// src/app/(auth)/layout.tsx
// Auth group layout — centered card layout for login/signup pages

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    default: "Sign In — AlgoFin",
    template: "%s | AlgoFin",
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      {/* Logo */}
      <Link href="/" className="mb-8 flex items-center gap-2 group">
        <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center glow-cyan-sm transition-all group-hover:glow-cyan">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M9 2L15 6V12L9 16L3 12V6L9 2Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              className="text-primary"
            />
            <path
              d="M9 6L12 8.5V11.5L9 14L6 11.5V8.5L9 6Z"
              fill="currentColor"
              className="text-primary"
            />
          </svg>
        </div>
        <span className="text-lg font-semibold tracking-tight text-gradient-cyan">
          AlgoFin
        </span>
      </Link>

      {/* Auth card */}
      <div className="w-full max-w-md">{children}</div>

      {/* Footer */}
      <p className="mt-8 text-xs text-muted-foreground text-center">
        AlgoFin is in closed beta.{" "}
        <Link href="/" className="underline underline-offset-4 hover:text-foreground transition-colors">
          Learn more
        </Link>
      </p>
    </div>
  );
}
