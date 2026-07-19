// src/app/auth/google/success/handler.tsx
// The actual client component that reads URL params.
// Separated from page.tsx so useSearchParams() can be inside Suspense.

"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import type { User } from "@/types";

export default function GoogleSuccessHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    const token = searchParams.get("token");
    const userB64 = searchParams.get("user");

    if (!token || !userB64) {
      console.error("[OAuth] Missing token or user in callback URL");
      router.replace("/login?error=oauth_failed");
      return;
    }

    try {
      // Decode base64url-encoded user JSON
      const userJson = atob(userB64.replace(/-/g, "+").replace(/_/g, "/"));
      const user: User = JSON.parse(userJson);

      // Store token + user in Zustand (persisted to THIS domain's localStorage)
      login({ access_token: token, user });

      // Replace history entry to remove token from URL (security hygiene)
      router.replace("/dashboard");
    } catch (e) {
      console.error("[OAuth] Failed to parse OAuth callback params:", e);
      router.replace("/login?error=oauth_parse_failed");
    }
  }, [searchParams, login, router]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#0f1117",
        color: "#00d4aa",
        fontFamily: "sans-serif",
        fontSize: "1.1rem",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid #00d4aa",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }}
        />
        <p>Signing you in…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
