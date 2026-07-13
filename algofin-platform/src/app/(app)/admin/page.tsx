"use client";
// src/app/(app)/admin/page.tsx
// AlgoFin v1 — Admin Panel (Phase G — MVP-Plus)
// Only accessible to users with role === "admin"
// Shows: user list, sync run status, billing overview

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { relativeTime } from "@/lib/staleness";

// ── Types ─────────────────────────────────────────────────────────
interface AdminUser {
  id:                string;
  email:             string;
  full_name:         string | null;
  role:              string;
  is_active:         boolean;
  created_at:        string;
  exchange_accounts: number;
  last_sync_status:  string | null;
  last_sync_at:      string | null;
}

interface SyncRun {
  id:               string;
  sync_type:        string;
  status:           string;
  started_at:       string;
  finished_at:      string | null;
  rows_processed:   number;
  error_message:    string | null;
  exchange_account: string;
  user_email:       string;
}

interface BillingUser {
  user_id:                string;
  user_email:             string;
  total_realized_pnl:     number;
  performance_fee_amount: number;
  consented_accounts:     number;
  is_complete:            boolean;
}

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_SYNC: Record<string, string> = {
  success: "text-emerald-400",
  error:   "text-rose-400",
  running: "text-amber-400",
  partial: "text-amber-400",
};

// ── Tab button ────────────────────────────────────────────────────
function Tab({ label, active, onClick, badge }: { label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2
        ${active ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-white/4"}`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold
          ${active ? "bg-primary/20 text-primary" : "bg-white/10 text-muted-foreground"}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Users tab ─────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: AdminUser[] }>("/admin/users")
      .then((r) => setUsers(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 flex justify-center"><div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="surface-card overflow-hidden">
      <div className="px-5 py-3 border-b border-white/6 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{users.length} users</p>
      </div>
      <div className="divide-y divide-white/5">
        {/* Header */}
        <div className="grid grid-cols-5 gap-4 px-5 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          <span className="col-span-2">User</span>
          <span className="text-center">Role</span>
          <span className="text-center">Accounts</span>
          <span className="text-right">Last sync</span>
        </div>

        {users.map((u) => (
          <div key={u.id} className="grid grid-cols-5 gap-4 px-5 py-3 text-sm hover:bg-white/2 transition-colors items-center">
            <div className="col-span-2 min-w-0">
              <p className="text-foreground font-medium truncate">{u.full_name || "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>
            <div className="flex justify-center">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                ${u.role === "admin" ? "bg-primary/15 text-primary border border-primary/20" : "bg-white/5 text-muted-foreground"}`}>
                {u.role}
              </span>
            </div>
            <p className="text-center text-foreground">{u.exchange_accounts}</p>
            <div className="text-right">
              {u.last_sync_at ? (
                <span className={`text-xs ${STATUS_SYNC[u.last_sync_status ?? ""] ?? "text-muted-foreground"}`}>
                  {relativeTime(u.last_sync_at)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/40">Never</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sync tab ──────────────────────────────────────────────────────
function SyncTab() {
  const [data, setData]       = useState<{ summary: any; recent_runs: SyncRun[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get<{ data: any }>("/admin/sync/status")
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-8 flex justify-center"><div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (!data) return <div className="surface-card p-8 text-center text-sm text-muted-foreground">No sync data available.</div>;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total runs",   value: data.summary.total_runs },
          { label: "Errors",       value: data.summary.error_runs },
          { label: "Success rate", value: data.summary.success_rate },
        ].map(({ label, value }) => (
          <div key={label} className="surface-card px-4 py-3 text-center">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className={`text-lg font-bold mt-1 ${label === "Errors" && value > 0 ? "text-rose-400" : "text-foreground"}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Recent runs table */}
      <div className="surface-card overflow-hidden">
        <div className="px-5 py-3 border-b border-white/6 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Recent sync runs</p>
          <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Refresh</button>
        </div>
        <div className="divide-y divide-white/5">
          <div className="grid grid-cols-5 gap-3 px-5 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <span>Account</span><span>Type</span><span>Status</span><span>Rows</span><span className="text-right">Time</span>
          </div>
          {data.recent_runs.map((r) => (
            <div key={r.id} className="grid grid-cols-5 gap-3 px-5 py-2.5 text-sm hover:bg-white/2 items-center">
              <div className="min-w-0">
                <p className="text-foreground truncate text-xs">{r.exchange_account}</p>
                <p className="text-muted-foreground/60 truncate text-[10px]">{r.user_email}</p>
              </div>
              <span className="text-xs font-mono text-muted-foreground">{r.sync_type}</span>
              <span className={`text-xs font-medium ${STATUS_SYNC[r.status] ?? "text-muted-foreground"}`}>{r.status}</span>
              <span className="text-xs text-foreground">{r.rows_processed}</span>
              <span className="text-right text-xs text-muted-foreground">{relativeTime(r.started_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Billing tab ───────────────────────────────────────────────────
function BillingTab() {
  const [data, setData]       = useState<{ period_start: string; period_end: string; total_estimated_fee_usdt: number; active_billing_users: number; users: BillingUser[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: any }>("/admin/billing/overview")
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 flex justify-center"><div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (!data) return <div className="surface-card p-8 text-center text-sm text-muted-foreground">No billing data.</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="surface-card px-5 py-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Platform estimated fee MTD</p>
          <p className="text-2xl font-bold text-foreground mt-1">${fmt(data.total_estimated_fee_usdt)} USDT</p>
          <p className="text-xs text-muted-foreground mt-0.5">{data.period_start} → {data.period_end}</p>
        </div>
        <div className="surface-card px-5 py-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Users with billing consent</p>
          <p className="text-2xl font-bold text-foreground mt-1">{data.active_billing_users}</p>
          <p className="text-xs text-muted-foreground mt-0.5">active this period</p>
        </div>
      </div>

      <div className="px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/15 text-xs text-amber-300">
        <strong>Shadow billing only.</strong> These are estimates — no payment is collected in v1 beta.
      </div>

      <div className="surface-card overflow-hidden">
        <div className="px-5 py-3 border-b border-white/6">
          <p className="text-sm font-semibold text-foreground">Per-user breakdown</p>
        </div>
        <div className="divide-y divide-white/5">
          <div className="grid grid-cols-4 gap-4 px-5 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <span className="col-span-2">User</span><span className="text-right">Realized PnL</span><span className="text-right">Est. fee</span>
          </div>
          {data.users.map((u) => (
            <div key={u.user_id} className="grid grid-cols-4 gap-4 px-5 py-3 text-sm hover:bg-white/2">
              <div className="col-span-2 min-w-0">
                <p className="text-foreground truncate text-xs">{u.user_email}</p>
                {!u.is_complete && <p className="text-[10px] text-amber-400">⚠ Incomplete sync data</p>}
              </div>
              <p className={`text-right text-xs font-medium ${u.total_realized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {u.total_realized_pnl >= 0 ? "+" : ""}${fmt(u.total_realized_pnl)}
              </p>
              <p className="text-right text-xs text-foreground">${fmt(u.performance_fee_amount)}</p>
            </div>
          ))}
          {data.users.length === 0 && (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground">
              No users with billing consent this month.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<"users" | "sync" | "billing">("users");

  // Admin guard — redirect if not admin
  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Access denied — admin only.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-rose-400">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Platform management and oversight</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Tab label="Users"   active={tab === "users"}   onClick={() => setTab("users")} />
        <Tab label="Sync"    active={tab === "sync"}    onClick={() => setTab("sync")} />
        <Tab label="Billing" active={tab === "billing"} onClick={() => setTab("billing")} />
      </div>

      {/* Content */}
      {tab === "users"   && <UsersTab />}
      {tab === "sync"    && <SyncTab />}
      {tab === "billing" && <BillingTab />}
    </div>
  );
}
