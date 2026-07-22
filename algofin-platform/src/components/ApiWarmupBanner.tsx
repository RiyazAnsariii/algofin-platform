// src/components/ApiWarmupBanner.tsx
// Displays a top banner when the Render backend is waking up.
// Only shown when state === "warming" — disappears automatically when API is ready.

"use client";

import { useApiWarmup } from "@/hooks/useApiWarmup";

export function ApiWarmupBanner() {
  const { state, elapsedMs } = useApiWarmup();
  const seconds = Math.floor(elapsedMs / 1000);

  if (state === "idle" || state === "ready") return null;

  if (state === "failed") {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "linear-gradient(90deg, #7f1d1d, #991b1b)",
          color: "#fef2f2",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "13px",
          fontFamily: "system-ui, sans-serif",
          boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
        }}
      >
        <span style={{ fontSize: "16px" }}>⚠️</span>
        <span>
          <strong>API unavailable.</strong> The server did not respond within 60 seconds.
          Please refresh the page or try again shortly.
        </span>
      </div>
    );
  }

  // state === "warming"
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "linear-gradient(90deg, #1e3a5f, #1d4ed8)",
        color: "#e0f2fe",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "13px",
        fontFamily: "system-ui, sans-serif",
        boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {/* Spinner */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" stroke="#93c5fd" strokeWidth="3" strokeDasharray="31 10" />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </svg>

        <span>
          <strong>AlgoFin API is starting up</strong> — this takes ~15 seconds on the first visit.
          {seconds > 3 && (
            <span style={{ marginLeft: "8px", opacity: 0.7 }}>
              ({seconds}s)
            </span>
          )}
        </span>
      </div>

      {/* Animated progress dots */}
      <span style={{ opacity: 0.6, letterSpacing: "2px" }}>
        {["·", "·", "·"].map((dot, i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
            }}
          >
            {dot}
            <style>{`@keyframes pulse { 0%,80%,100% { opacity: 0.2; } 40% { opacity: 1; } }`}</style>
          </span>
        ))}
      </span>
    </div>
  );
}
