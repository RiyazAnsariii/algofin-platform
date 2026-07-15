"use client";
// src/app/(app)/admin/page.tsx
// AlgoFin v1 — Admin Panel (Phase I: complete)
// Tabs: Users, Sync, Billing, Activity
// Features: user detail modal, manual sync trigger, role management, login activity log

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

interface UserDetail {
  id:               string;
  email:            string;
  full_name:        string;
  role:             string;
  is_active:        boolean;
  created_at:       string;
  exchange_accounts: {
    id:              string;
    label:           string;
    exchange_id:     string;
    sync_status:     string;
    billing_consent: boolean;
    last_sync_at:    string | null;
  }[];
  mtd_billing: {
    total_realized_pnl:     number;
    performance_fee_amount: number;
    is_complete:            boolean;
  } | null;
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

interface ActivityRow {
  id:         string;
  user_email: string;
  user_id:    string;
  event:      string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_COLOR: Record<string, string> = {
  success:   "text-emerald-400",
  error:     "text-rose-400",
  running:   "text-amber-400",
  partial:   "text-amber-400",
  connected: "text-emerald-400",
  stale:     "text-amber-400",
  pending:   "text-muted-foreground",
};

const EVENT_COLOR: Record<string, string> = {
  login_success:    "text-emerald-400",
  login_failed:     "text-rose-400",
  logout:           "text-muted-foreground",
  token_refreshed:  "text-blue-400",
  password_changed: "text-amber-400",
};

function Spinner() {
  return (
    <div className="p-10 flex justify-center">
      <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────
function Tab({ label, active, onClick, badge }: {
  label: string; active: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2
        ${active
          ? "bg-primary/15 text-primary border border-primary/30"
          : "text-muted-foreground hover:text-foreground hover:bg-white/4"
        }`}
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

// ── User Detail Modal ─────────────────────────────────────────────
function UserDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [detail, setDetail]     = useState<UserDetail | null>(null);
  const [activity, setActivity] = useState<{ event: string; ip_address: string | null; created_at: string }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ data: UserDetail }>(`/admin/users/${userId}`),
      api.get<{ data: typeof activity }>(`/admin/users/${userId}/activity`),
    ]).then(([dr, ar]) => {
      setDetail(dr.data.data);
      setActivity(ar.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [userId]);

  const handleSync = async (accountId: string) => {
    setTriggering(accountId);
    try {
      await api.post(`/admin/sync/trigger/${accountId}`);
      setToast("✓ Sync triggered!");
    } catch {
      setToast("⚠ Failed to trigger sync.");
    } finally {
      setTriggering(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleRole = async (action: "promote" | "demote") => {
    try {
      const res = await api.post<{ data: { message: string } }>(`/admin/users/${userId}/${action}`);
      setToast(`✓ ${res.data.data.message}`);
      if (detail) setDetail({ ...detail, role: action === "promote" ? "admin" : "user" });
    } catch (err: any) {
      setToast(`⚠ ${err?.response?.data?.detail ?? "Failed"}`);
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-surface-1 border border-white/10 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-surface-1 z-10">
          <div>
            <p className="font-semibold text-foreground">{detail?.email ?? "Loading…"}</p>
            {detail && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium
                  ${detail.role === "admin" ? "bg-primary/15 text-primary border border-primary/20" : "bg-white/5 text-muted-foreground"}`}>
                  {detail.role}
                </span>
                <span className="text-xs text-muted-foreground">Joined {relativeTime(detail.created_at)}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? <Spinner /> : detail ? (
          <div className="p-6 space-y-6">
            {/* MTD Billing */}
            {detail.mtd_billing && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-2 rounded-xl px-4 py-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">MTD Realized PnL</p>
                  <p className={`text-lg font-bold mt-1 ${detail.mtd_billing.total_realized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {detail.mtd_billing.total_realized_pnl >= 0 ? "+" : ""}${fmt(detail.mtd_billing.total_realized_pnl)}
                  </p>
                </div>
                <div className="bg-surface-2 rounded-xl px-4 py-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Fee</p>
                  <p className="text-lg font-bold mt-1 text-foreground">${fmt(detail.mtd_billing.performance_fee_amount)}</p>
                </div>
              </div>
            )}

            {/* Exchange accounts */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Exchange Accounts</p>
              {detail.exchange_accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No exchange accounts connected.</p>
              ) : (
                <div className="space-y-2">
                  {detail.exchange_accounts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between bg-surface-2 rounded-xl px-4 py-3 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{a.label}</p>
                        <p className="text-xs text-muted-foreground">{a.exchange_id}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-xs font-medium ${STATUS_COLOR[a.sync_status] ?? "text-muted-foreground"}`}>
                          {a.sync_status}
                        </span>
                        <button
                          onClick={() => handleSync(a.id)}
                          disabled={triggering === a.id}
                          className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary
                            text-xs font-medium hover:bg-primary/15 transition-all disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {triggering === a.id ? (
                            <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.95" />
                            </svg>
                          )}
                          Sync
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent activity */}
            {activity.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Activity</p>
                <div className="space-y-1.5">
                  {activity.slice(0, 8).map((a) => (
                    <div key={a.created_at} className="flex items-center justify-between text-xs py-1.5 border-b border-white/4 last:border-0">
                      <span className={`font-mono font-medium ${EVENT_COLOR[a.event] ?? "text-muted-foreground"}`}>
                        {a.event}
                      </span>
                      <div className="text-right">
                        <p className="text-muted-foreground">{relativeTime(a.created_at)}</p>
                        {a.ip_address && <p className="text-muted-foreground/50 font-mono text-[10px]">{a.ip_address}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Role management */}
            <div className="border-t border-white/6 pt-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Role management</p>
                <p className="text-xs text-muted-foreground mt-0.5">Current role: <strong>{detail.role}</strong></p>
              </div>
              {detail.role === "user" ? (
                <button
                  onClick={() => handleRole("promote")}
                  className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary
                    text-xs font-medium hover:bg-primary/15 transition-all"
                >
                  Promote to Admin
                </button>
              ) : (
                <button
                  onClick={() => handleRole("demote")}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400
                    text-xs font-medium hover:bg-rose-500/15 transition-all"
                >
                  Demote to User
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">Failed to load user details.</p>
        )}

        {toast && (
          <div className="sticky bottom-0 px-6 py-3 bg-surface-1 border-t border-white/8 text-sm text-emerald-400">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers]       = useState<AdminUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch]     = useState("");

  useEffect(() => {
    api.get<{ data: AdminUser[] }>("/admin/users")
      .then((r) => setUsers(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter((u) =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.full_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <Spinner />;

  return (
    <>
      {selected && <UserDetailModal userId={selected} onClose={() => setSelected(null)} />}

      <div className="surface-card overflow-hidden">
        <div className="px-5 py-3 border-b border-white/6 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{users.length} users</p>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="px-3 py-1.5 rounded-lg bg-surface-2 border border-white/8 text-xs text-foreground
              placeholder:text-muted-foreground/60 outline-none focus:border-primary/30 w-52"
          />
        </div>

        {/* Header */}
        <div className="grid grid-cols-5 gap-4 px-5 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider border-b border-white/4">
          <span className="col-span-2">User</span>
          <span className="text-center">Role</span>
          <span className="text-center">Accounts</span>
          <span className="text-right">Last sync</span>
        </div>

        <div className="divide-y divide-white/4">
          {filtered.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelected(u.id)}
              className="w-full grid grid-cols-5 gap-4 px-5 py-3 text-sm hover:bg-white/3 transition-colors items-center text-left"
            >
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
                  <span className={`text-xs ${STATUS_COLOR[u.last_sync_status ?? ""] ?? "text-muted-foreground"}`}>
                    {relativeTime(u.last_sync_at)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/40">Never</span>
                )}
              </div>
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              {search ? "No users match your search." : "No users found."}
            </div>
          )}
        </div>
      </div>
    </>
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

  if (loading) return <Spinner />;
  if (!data) return <div className="surface-card p-8 text-center text-sm text-muted-foreground">No sync data available.</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total runs",   value: data.summary.total_runs,  danger: false },
          { label: "Errors",       value: data.summary.error_runs,  danger: data.summary.error_runs > 0 },
          { label: "Success rate", value: data.summary.success_rate, danger: false },
        ].map(({ label, value, danger }) => (
          <div key={label} className="surface-card px-4 py-3 text-center">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className={`text-lg font-bold mt-1 ${danger ? "text-rose-400" : "text-foreground"}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="px-5 py-3 border-b border-white/6 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Recent sync runs</p>
          <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.95" />
            </svg>
            Refresh
          </button>
        </div>
        <div className="divide-y divide-white/4">
          <div className="grid grid-cols-5 gap-3 px-5 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <span>Account</span><span>Type</span><span>Status</span><span>Rows</span><span className="text-right">Time</span>
          </div>
          {data.recent_runs.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground">No sync runs recorded yet.</div>
          ) : data.recent_runs.map((r) => (
            <div key={r.id} className="grid grid-cols-5 gap-3 px-5 py-2.5 text-sm hover:bg-white/2 items-center">
              <div className="min-w-0">
                <p className="text-foreground truncate text-xs">{r.exchange_account}</p>
                <p className="text-muted-foreground/60 truncate text-[10px]">{r.user_email}</p>
              </div>
              <span className="text-xs font-mono text-muted-foreground">{r.sync_type}</span>
              <span className={`text-xs font-medium ${STATUS_COLOR[r.status] ?? "text-muted-foreground"}`}>{r.status}</span>
              <span className="text-xs text-foreground">{r.rows_processed}</span>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{relativeTime(r.started_at)}</p>
                {r.error_message && (
                  <p className="text-[10px] text-rose-400 truncate max-w-[120px] ml-auto" title={r.error_message}>
                    {r.error_message}
                  </p>
                )}
              </div>
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

  if (loading) return <Spinner />;
  if (!data) return <div className="surface-card p-8 text-center text-sm text-muted-foreground">No billing data.</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="surface-card px-5 py-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Platform estimated fee MTD</p>
          <p className="text-2xl font-bold text-foreground mt-1">${fmt(data.total_estimated_fee_usdt)} <span className="text-sm font-normal text-muted-foreground">USDT</span></p>
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
        <div className="divide-y divide-white/4">
          <div className="grid grid-cols-4 gap-4 px-5 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <span className="col-span-2">User</span>
            <span className="text-right">Realized PnL</span>
            <span className="text-right">Est. fee</span>
          </div>
          {data.users.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground">
              No users with billing consent this month.
            </div>
          ) : data.users.map((u) => (
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
        </div>
      </div>
    </div>
  );
}

// ── Activity tab ──────────────────────────────────────────────────
function ActivityTab() {
  const [rows, setRows]       = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.get<{ data: ActivityRow[] }>("/admin/activity")
      .then((r) => setRows(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) =>
    !search ||
    r.user_email.toLowerCase().includes(search.toLowerCase()) ||
    r.event.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <Spinner />;

  return (
    <div className="surface-card overflow-hidden">
      <div className="px-5 py-3 border-b border-white/6 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">Login activity log</p>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by user or event…"
            className="px-3 py-1.5 rounded-lg bg-surface-2 border border-white/8 text-xs text-foreground
              placeholder:text-muted-foreground/60 outline-none focus:border-primary/30 w-48"
          />
          <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Refresh
          </button>
        </div>
      </div>

      <div className="divide-y divide-white/4">
        <div className="grid grid-cols-4 gap-4 px-5 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          <span className="col-span-2">User</span>
          <span>Event</span>
          <span className="text-right">Time</span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            {search ? "No activity matching filter." : "No login activity recorded yet."}
          </div>
        ) : filtered.map((r) => (
          <div key={r.id} className="grid grid-cols-4 gap-4 px-5 py-2.5 text-sm hover:bg-white/2 items-center">
            <div className="col-span-2 min-w-0">
              <p className="text-xs text-foreground truncate">{r.user_email}</p>
              {r.ip_address && (
                <p className="text-[10px] font-mono text-muted-foreground/60">{r.ip_address}</p>
              )}
            </div>
            <span className={`text-xs font-medium ${EVENT_COLOR[r.event] ?? "text-muted-foreground"}`}>
              {r.event}
            </span>
            <span className="text-right text-xs text-muted-foreground">{relativeTime(r.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
type TabName = "users" | "sync" | "billing" | "activity";

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<TabName>("users");

  // Admin guard
  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-rose-400">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground">Access denied</p>
          <p className="text-xs text-muted-foreground mt-1">Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-rose-400">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Platform management and oversight</p>
        </div>
        <div className="ml-auto">
          <span className="px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
            Admin
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Tab label="Users"    active={tab === "users"}    onClick={() => setTab("users")} />
        <Tab label="Sync"     active={tab === "sync"}     onClick={() => setTab("sync")} />
        <Tab label="Billing"  active={tab === "billing"}  onClick={() => setTab("billing")} />
        <Tab label="Activity" active={tab === "activity"} onClick={() => setTab("activity")} />
      </div>

      {/* Content */}
      {tab === "users"    && <UsersTab />}
      {tab === "sync"     && <SyncTab />}
      {tab === "billing"  && <BillingTab />}
      {tab === "activity" && <ActivityTab />}
    </div>
  );
}
