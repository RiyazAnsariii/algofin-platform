// src/proxy.ts
// AlgoFin v1 — Next.js Proxy (formerly middleware.ts, renamed in Next.js 16)
//
// LOCKED DECISION (plan.md Section 4-A):
//   This proxy does NOT enforce authentication.
//   Do NOT read any token from cookies here.
//   Route protection is implemented CLIENT-SIDE ONLY in (app)/layout.tsx.
//
//   Reason: The access token lives in Zustand/localStorage (not a cookie).
//   Proxy/middleware runs on the edge and cannot see localStorage.
//   Enforcing auth here against a non-existent cookie would silently
//   pass all requests as unauthenticated.
//
//   The client-side guard in (app)/layout.tsx is correct and sufficient for v1.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest): NextResponse {
  // Pass-through only — no auth enforcement
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude static files and API routes
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
