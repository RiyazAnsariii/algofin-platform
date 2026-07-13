"use client";
// src/app/(app)/layout.tsx
// AlgoFin v1 — App shell: auth guard + premium sidebar + topbar
//
// Auth model LOCKED (plan.md Section 4-A):
//   - Client-side guard only — proxy.ts does NOT enforce auth
//   - On mount: read store → try refresh → redirect on failure

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import api from "@/lib/api";
import type { User } from "@/types";

// ── Nav items ─────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    href:  "/dashboard",
    label: "Dashboard",
    icon:  (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href:  "/exchanges",
    label: "Exchanges",
    icon:  (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    href:  "/orders",
    label: "Orders",
    icon:  (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    href:  "/events",
    label: "Economic Calendar",
    icon:  (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
        <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
        <circle cx="12" cy="15" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    href:  "/assistant",
    label: "AI Assistant",
    icon:  (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    href:  "/billing",
    label: "Billing",
    icon:  (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
        <path d="M12 6v2M12 16v2M8.46 8.46l1.42 1.42M14.12 14.12l1.42 1.42M6 12h2M16 12h2M8.46 15.54l1.42-1.42M14.12 9.88l1.42-1.42" />
      </svg>
    ),
  },
  {
    href:  "/settings",
    label: "Settings",
    icon:  (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
] as const;

// ── Sidebar ───────────────────────────────────────────────────────
function Sidebar({
  user,
  onLogout,
}: {
  user: User | null;
  onLogout: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="w-60 flex-shrink-0 hidden lg:flex flex-col border-r border-white/6 bg-sidebar min-h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 h-14 flex items-center border-b border-white/6">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center transition-all group-hover:glow-cyan-sm">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L15 6V12L9 16L3 12V6L9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="text-primary" />
              <path d="M9 6L12 8.5V11.5L9 14L6 11.5V8.5L9 6Z" fill="currentColor" className="text-primary" />
            </svg>
          </div>
          <span className="font-semibold text-sm text-gradient-cyan">AlgoFin</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all
                ${active
                  ? "bg-primary/10 text-primary font-medium border border-primary/15"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }
              `}
            >
              <span className={active ? "text-primary" : "text-muted-foreground"}>
                {item.icon(active)}
              </span>
              {item.label}
            </Link>
          );
        })}

        {/* Admin link — only visible to admins */}
        {user?.role === "admin" && (
          <Link
            href="/admin"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all mt-2 border
              ${pathname === "/admin"
                ? "bg-rose-500/10 text-rose-400 border-rose-500/20 font-medium"
                : "text-muted-foreground hover:text-rose-400 hover:bg-rose-500/5 border-transparent"
              }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={pathname === "/admin" ? 2 : 1.5}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Admin
          </Link>
        )}
      </nav>

      {/* User + Logout */}
      <div className="px-2 py-3 border-t border-white/6">
        {user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-foreground truncate">{user.full_name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ── Mobile top bar ────────────────────────────────────────────────
function MobileTopBar({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname();
  const currentItem = NAV_ITEMS.find(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/")
  );

  return (
    <header className="lg:hidden sticky top-0 z-40 h-14 flex items-center justify-between px-4 glass border-b border-white/6">
      <Link href="/dashboard" className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
            <path d="M9 2L15 6V12L9 16L3 12V6L9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="text-primary" />
            <path d="M9 6L12 8.5V11.5L9 14L6 11.5V8.5L9 6Z" fill="currentColor" className="text-primary" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-gradient-cyan">AlgoFin</span>
        {currentItem && (
          <span className="text-muted-foreground text-sm">/ {currentItem.label}</span>
        )}
      </Link>
      <button
        onClick={onLogout}
        className="text-muted-foreground hover:text-foreground transition-colors p-1.5"
        aria-label="Sign out"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
      </button>
    </header>
  );
}

// ── App layout ────────────────────────────────────────────────────
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const { isAuthenticated, user, setAccessToken, setUser, clearAuth, logout } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const guard = async () => {
      if (isAuthenticated) { setChecking(false); return; }

      try {
        const res = await api.post<{ data: { access_token: string; user: User } }>("/auth/refresh");
        setAccessToken(res.data.data.access_token);
        setUser(res.data.data.user);
      } catch {
        clearAuth();
        router.replace("/login");
        return;
      } finally {
        setChecking(false);
      }
    };
    guard();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    logout();
    router.replace("/login");
  }, [logout, router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar user={user} onLogout={handleLogout} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopBar onLogout={handleLogout} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
