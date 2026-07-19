// src/app/auth/google/success/page.tsx
// AlgoFin — Google OAuth success handler
//
// The backend redirects here after a successful OAuth exchange with:
//   ?token=<access_token>&user=<base64-encoded-user-json>
//
// This page runs on the FRONTEND domain (algofin-platform.vercel.app),
// so it can safely write to the frontend's localStorage via Zustand.
//
// IMPORTANT: useSearchParams() requires a Suspense boundary in Next.js App Router.

import { Suspense } from "react";
import GoogleSuccessHandler from "./handler";

export default function GoogleSuccessPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            background: "#0f1117",
            color: "#00d4aa",
            fontFamily: "sans-serif",
          }}
        >
          <p>Signing you in…</p>
        </div>
      }
    >
      <GoogleSuccessHandler />
    </Suspense>
  );
}
