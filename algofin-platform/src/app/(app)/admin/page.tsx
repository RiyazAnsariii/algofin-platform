"use client";
// src/app/(app)/admin/page.tsx
// AlgoFin v1 — Admin Panel (Premium redesign matching screenshot)

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { relativeTime } from "@/lib/staleness";

// ── Types ─────────────────────────────────────────────────────────
interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  exchange_accounts: number;
  last_sync_status: string | null;
  last_sync_at: string | null;
  suspended_until: string | null;
  is_permanently_blocked: boolean;
}

interface UserDetail {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  exchange_accounts: {
    id: string;
    label: string;
    exchange_id: string;
    sync_status: string;
    billing_consent: boolean;
    last_sync_at: string | null;
  }[];
  mtd_billing: {
    total_realized_pnl: number;
    performance_fee_amount: number;
    is_complete: boolean;
  } | null;
}

interface SyncRun {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  rows_processed: number;
  error_message: string | null;
  exchange_account: string;
  user_email: string;
}

interface BillingUser {
  user_id: string;
  user_email: string;
  total_realized_pnl: number;
  performance_fee_amount: number;
  consented_accounts: number;
  is_complete: boolean;
}

interface ActivityRow {
  id: string;
  user_email: string;
  user_id: string;
  event: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getInitials(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(" ");
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "from-cyan-500 to-blue-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-600",
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Avatar({ name, email, id, size = "sm" }: {
  name: string | null; email: string; id: string; size?: "sm" | "md";
}) {
  const sz = size === "md" ? "w-9 h-9 text-sm" : "w-7 h-7 text-xs";
  return (
    <div className={`${sz} rounded-full bg-gradient-to-br ${avatarColor(id)} flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {getInitials(name, email)}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

// ── SVG Donut Chart ───────────────────────────────────────────────
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 58; const cx = 75; const cy = 75; const sw = 16;
  let off = -Math.PI / 2;
  const segs = data.map((d) => {
    const ang = (d.value / Math.max(total, 1)) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(off); const y1 = cy + R * Math.sin(off);
    off += ang;
    const x2 = cx + R * Math.cos(off); const y2 = cy + R * Math.sin(off);
    return { ...d, x1, y1, x2, y2, la: ang > Math.PI ? 1 : 0, ang };
  });
  return (
    <div className="flex items-center gap-5">
      <div className="relative flex-shrink-0">
        <svg width="150" height="150" viewBox="0 0 150 150">
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={sw} />
          {segs.map((s, i) => s.ang > 0.02 ? (
            <path key={i} d={`M ${s.x1} ${s.y1} A ${R} ${R} 0 ${s.la} 1 ${s.x2} ${s.y2}`}
              fill="none" stroke={s.color} strokeWidth={sw} strokeLinecap="round" />
          ) : null)}
          <text x={cx} y={cy - 7} textAnchor="middle" fill="white" fontSize="11" fontWeight="500" opacity="0.45">Total</text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill="white" fontSize="20" fontWeight="700">{total}</text>
        </svg>
      </div>
      <div className="space-y-2.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: d.color }} />
            <span className="text-xs text-muted-foreground min-w-[72px]">{d.label}</span>
            <span className="text-xs font-semibold text-foreground w-6 text-right">{d.value}</span>
            <span className="text-[10px] text-muted-foreground/45 w-12 text-right">
              ({total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── User Detail Modal ─────────────────────────────────────────────
function UserDetailModal({ userId, onClose, onRefresh }: {
  userId: string; onClose: () => void; onRefresh: () => void;
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  const { user: cu } = useAuthStore();

  useEffect(() => {
    api.get<{ data: UserDetail }>(`/admin/users/${userId}`)
      .then((r) => setDetail(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSync = async (accountId: string) => {
    setTriggering(accountId);
    try {
      await api.post(`/admin/sync/trigger/${accountId}`);
      showToast("Sync triggered successfully!");
    } catch { showToast("Failed to trigger sync.", false); }
    finally { setTriggering(null); }
  };

  const handleRole = async (action: "promote" | "demote") => {
    try {
      const res = await api.post<{ data: { message: string } }>(`/admin/users/${userId}/${action}`);
      showToast(res.data.data.message);
      if (detail) setDetail({ ...detail, role: action === "promote" ? "admin" : "user" });
      onRefresh();
    } catch (err: any) {
      showToast(err?.response?.data?.detail ?? "Failed", false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 sticky top-0 bg-[#0f1117] z-10">
          {detail && <Avatar name={detail.full_name} email={detail.email} id={detail.id} size="md" />}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{detail?.full_name || detail?.email || "Loading..."}</p>
            {detail && <p className="text-xs text-muted-foreground truncate">{detail.email}</p>}
          </div>
          <div className="flex items-center gap-2">
            {detail && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                detail.role === "admin" ? "bg-rose-500/15 text-rose-400 border-rose-500/25" : "bg-white/5 text-muted-foreground border-white/10"
              }`}>{detail.role}</span>
            )}
            <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {loading ? <Spinner /> : detail ? (
          <div className="p-5 space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              {detail.mtd_billing && (
                <>
                  <div className="bg-white/3 rounded-xl px-4 py-3 text-center border border-white/5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">MTD Realized PnL</p>
                    <p className={`text-base font-bold ${detail.mtd_billing.total_realized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {detail.mtd_billing.total_realized_pnl >= 0 ? "+" : ""}${fmt(detail.mtd_billing.total_realized_pnl)}
                    </p>
                  </div>
                  <div className="bg-white/3 rounded-xl px-4 py-3 text-center border border-white/5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Est. Fee</p>
                    <p className="text-base font-bold text-foreground">${fmt(detail.mtd_billing.performance_fee_amount)}</p>
                  </div>
                </>
              )}
              <div className="bg-white/3 rounded-xl px-4 py-3 text-center border border-white/5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Joined</p>
                <p className="text-sm font-semibold text-foreground">{new Date(detail.created_at).toLocaleDateString()}</p>
              </div>
              <div className="bg-white/3 rounded-xl px-4 py-3 text-center border border-white/5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                <span className={`text-sm font-semibold ${detail.is_active ? "text-emerald-400" : "text-rose-400"}`}>
                  {detail.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            {/* Exchange accounts */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Exchange Accounts ({detail.exchange_accounts.length})
              </p>
              {detail.exchange_accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No accounts connected.</p>
              ) : (
                <div className="space-y-2">
                  {detail.exchange_accounts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between bg-white/3 rounded-xl px-4 py-2.5 border border-white/5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{a.label}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{a.exchange_id} · {a.sync_status}</p>
                      </div>
                      <button onClick={() => handleSync(a.id)} disabled={triggering === a.id}
                        className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-all disabled:opacity-50 flex items-center gap-1.5 ml-3">
                        {triggering === a.id
                          ? <span className="w-3 h-3 border border-primary/30 border-t-primary rounded-full animate-spin" />
                          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.95" /></svg>
                        }
                        Sync
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Role management */}
            {cu?.id !== detail.id && (
              <div className="border-t border-white/6 pt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Role Management</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Current: <strong className="text-foreground">{detail.role}</strong></p>
                </div>
                <div className="flex gap-2">
                  {detail.role === "user" ? (
                    <button onClick={() => handleRole("promote")}
                      className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-all">
                      Promote to Admin
                    </button>
                  ) : (
                    <button onClick={() => handleRole("demote")}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-all">
                      Demote to User
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">Failed to load user details.</p>
        )}

        {toast && (
          <div className={`sticky bottom-0 px-5 py-3 border-t border-white/8 text-xs font-medium ${toast.ok ? "text-emerald-400" : "text-amber-400"}`}>
            {toast.ok ? "✓" : "⚠"} {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}



// ── Suspend Modal ─────────────────────────────────────────────────
function SuspendModal({
  user, onClose, onSuccess,
}: {
  user: AdminUser; onClose: () => void; onSuccess: () => void;
}) {
  const [mode, setMode] = useState<"temporary" | "permanent">("temporary");
  const [days, setDays] = useState(1);
  const [hours, setHours] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalHours = days * 24 + hours;
  const expiry = new Date(Date.now() + totalHours * 3600_000);
  const expiryStr = expiry.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  const handleSubmit = async () => {
    if (mode === "temporary" && totalHours <= 0) {
      setErr("Set at least 1 hour."); return;
    }
    setBusy(true); setErr(null);
    try {
      const params = mode === "permanent"
        ? `permanent=true`
        : `days=${days}&hours=${hours}`;
      await api.post(`/admin/users/${user.id}/suspend?${params}`);
      onSuccess();
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Request failed.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0f1117] border border-white/12 rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
          <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-rose-400">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Disable Account</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <button onClick={onClose} className="ml-auto w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode("temporary")}
              className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-left transition-all ${
                mode === "temporary" ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-white/3 border-white/8 text-muted-foreground hover:border-white/15"
              }`}>
              <span className="text-xs font-semibold">Temporary Suspension</span>
              <span className="text-[10px] opacity-70">Set duration in days &amp; hours</span>
            </button>
            <button onClick={() => setMode("permanent")}
              className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-left transition-all ${
                mode === "permanent" ? "bg-rose-500/10 border-rose-500/30 text-rose-400" : "bg-white/3 border-white/8 text-muted-foreground hover:border-white/15"
              }`}>
              <span className="text-xs font-semibold">Permanent Block</span>
              <span className="text-[10px] opacity-70">No time limit — manual unblock only</span>
            </button>
          </div>

          {/* Duration pickers — only for temporary */}
          {mode === "temporary" && (
            <div className="space-y-3">
              <div className="flex gap-3">
                {/* Days */}
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Days</label>
                  <div className="flex items-center rounded-xl bg-white/4 border border-white/8 overflow-hidden">
                    <button onClick={() => setDays(Math.max(0, days - 1))}
                      className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all text-lg font-light flex-shrink-0">−</button>
                    <input type="number" min={0} max={365} value={days}
                      onChange={(e) => setDays(Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))}
                      className="flex-1 bg-transparent text-center text-sm font-semibold text-foreground outline-none w-0 py-2" />
                    <button onClick={() => setDays(Math.min(365, days + 1))}
                      className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all text-lg font-light flex-shrink-0">+</button>
                  </div>
                </div>
                {/* Hours */}
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Hours</label>
                  <div className="flex items-center rounded-xl bg-white/4 border border-white/8 overflow-hidden">
                    <button onClick={() => setHours(Math.max(0, hours - 1))}
                      className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all text-lg font-light flex-shrink-0">−</button>
                    <input type="number" min={0} max={23} value={hours}
                      onChange={(e) => setHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                      className="flex-1 bg-transparent text-center text-sm font-semibold text-foreground outline-none w-0 py-2" />
                    <button onClick={() => setHours(Math.min(23, hours + 1))}
                      className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all text-lg font-light flex-shrink-0">+</button>
                  </div>
                </div>
              </div>

              {/* Quick presets */}
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { label: "1h", d: 0, h: 1 }, { label: "6h", d: 0, h: 6 },
                  { label: "24h", d: 1, h: 0 }, { label: "3d", d: 3, h: 0 },
                  { label: "7d", d: 7, h: 0 }, { label: "30d", d: 30, h: 0 },
                ].map((p) => (
                  <button key={p.label} onClick={() => { setDays(p.d); setHours(p.h); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                      days === p.d && hours === p.h
                        ? "bg-amber-500/15 border-amber-500/25 text-amber-400"
                        : "bg-white/4 border-white/8 text-muted-foreground hover:text-foreground hover:bg-white/8"
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Expiry preview */}
              {totalHours > 0 && (
                <div className="px-3.5 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/15">
                  <p className="text-[11px] text-amber-300">
                    <span className="font-semibold">Expires:</span> {expiryStr}
                  </p>
                  <p className="text-[10px] text-amber-400/60 mt-0.5">
                    Total: {days > 0 ? `${days}d ` : ""}{hours > 0 ? `${hours}h` : ""}
                    {days === 0 && hours === 0 ? "0h" : ""}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Permanent warning */}
          {mode === "permanent" && (
            <div className="px-3.5 py-3 rounded-xl bg-rose-500/8 border border-rose-500/15 space-y-1">
              <p className="text-[11px] text-rose-400 font-semibold">⚠ Permanent block</p>
              <p className="text-[11px] text-rose-400/70 leading-relaxed">
                {user.email} will be immediately and indefinitely blocked from accessing AlgoFin. 
                No data is deleted. You can unblock manually at any time.
              </p>
            </div>
          )}

          {err && <p className="text-xs text-rose-400 px-1">{err}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/8 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground/50">No data will be deleted</p>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy}
              className="px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={busy || (mode === "temporary" && totalHours <= 0)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5 ${
                mode === "permanent"
                  ? "bg-rose-500/15 border border-rose-500/25 text-rose-400 hover:bg-rose-500/25"
                  : "bg-amber-500/15 border border-amber-500/25 text-amber-400 hover:bg-amber-500/25"
              }`}>
              {busy && <span className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />}
              {mode === "permanent" ? "Permanently Block" : "Suspend Account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────
function ConfirmModal({
  title, message, confirmLabel, confirmCls, onConfirm, onCancel, loading,
}: {
  title: string; message: string; confirmLabel: string;
  confirmCls?: string; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md" onClick={onCancel}>
      <div className="w-full max-w-sm bg-[#0f1117] border border-white/12 rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/8">
          <p className="font-semibold text-foreground text-sm">{title}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
        </div>
        <div className="px-5 py-3 border-t border-white/8 flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/8 transition-all disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5 ${confirmCls ?? "bg-primary text-black hover:bg-primary/90"}`}>
            {loading && <span className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── User Actions Dropdown ─────────────────────────────────────────
type ConfirmType = "role" | "exchange" | "suspend" | "unblock" | "remove" | null;

function UserActionsDropdown({
  user, currentUserId, onViewDetails, onRefresh,
}: {
  user: AdminUser; currentUserId: string;
  onViewDetails: () => void; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmType>(null);
  const [showSuspend, setShowSuspend] = useState(false);
  const [removeEmail, setRemoveEmail] = useState("");
  const [removeStep, setRemoveStep] = useState<1 | 2>(1);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isMe = user.id === currentUserId;
  const isBlocked = user.is_permanently_blocked || !user.is_active;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); setConfirm(null); setOpen(false); }
  };

  const handleTriggerSync = () => {
    setOpen(false);
    run(async () => {
      // Sync all exchange accounts for this user via admin endpoint
      const detail = await api.get<{ data: any }>(`/admin/users/${user.id}`);
      const accounts = detail.data.data.exchange_accounts as { id: string }[];
      if (accounts.length === 0) { showToast("No exchange accounts to sync.", false); return; }
      await Promise.all(accounts.map((a) => api.post(`/admin/sync/trigger/${a.id}`)));
      showToast(`✓ Sync triggered for ${accounts.length} account(s)`);
      onRefresh();
    });
  };

  const handleForceLogout = () => {
    setOpen(false);
    run(async () => {
      const res = await api.post<{ data: { message: string; tokens_revoked: number } }>(`/admin/users/${user.id}/force-logout`);
      showToast(`✓ ${res.data.data.message} (${res.data.data.tokens_revoked} sessions)`);
    });
  };

  const handleDisconnectExchange = async () => {
    setConfirm(null);
    run(async () => {
      const detail = await api.get<{ data: any }>(`/admin/users/${user.id}`);
      const accounts = detail.data.data.exchange_accounts as { id: string; label: string }[];
      if (accounts.length === 0) { showToast("No exchange accounts connected.", false); return; }
      // Disconnect all accounts via admin endpoint
      await Promise.all(accounts.map((a) =>
        api.delete(`/admin/users/${user.id}/exchange/${a.id}`)
      ));
      showToast(`✓ ${accounts.length} exchange account(s) disconnected`);
      onRefresh();
    });
  };

  const handleChangeRole = async () => {
    setConfirm(null);
    run(async () => {
      const action = user.role === "admin" ? "demote" : "promote";
      const res = await api.post<{ data: { message: string } }>(`/admin/users/${user.id}/${action}`);
      showToast(`✓ ${res.data.data.message}`);
      onRefresh();
    });
  };

  const handleDisableAccount = async () => {
    setConfirm(null);
    run(async () => {
      const res = await api.post<{ data: { message: string; is_active: boolean } }>(`/admin/users/${user.id}/toggle-active`);
      showToast(`✓ ${res.data.data.message}`);
      onRefresh();
    });
  };

  const handleUnblock = () => {
    setConfirm(null);
    run(async () => {
      const res = await api.post<{ data: { message: string } }>(`/admin/users/${user.id}/unblock`);
      showToast(`✓ ${res.data.data.message}`);
      onRefresh();
    });
  };

  const handleRemove = () => {
    // Don't close modal early — keep component mounted so onRefresh() fires properly
    run(async () => {
      await api.delete(`/admin/users/${user.id}?confirm_email=${encodeURIComponent(removeEmail)}`);
      setRemoveEmail("");
      setRemoveStep(1);
      showToast(`✓ ${user.email} permanently removed`);
      onRefresh();
    });
  };

  const menuItem = (
    icon: React.ReactNode, label: string, onClick: () => void,
    cls = "text-foreground/80 hover:text-foreground hover:bg-white/5"
  ) => (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-all text-left ${cls}`}>
      <span className="w-3.5 flex-shrink-0 flex items-center justify-center opacity-70">{icon}</span>
      {label}
    </button>
  );

  const Divider = () => <div className="my-1 border-t border-white/6" />;

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[70] px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg border ${
          toast.ok ? "bg-emerald-950 border-emerald-500/30 text-emerald-400" : "bg-amber-950 border-amber-500/30 text-amber-400"
        }`}>
          {toast.ok ? "✓" : "⚠"} {toast.msg}
        </div>
      )}

      {/* Confirm modals */}
      {confirm === "role" && (
        <ConfirmModal
          title={user.role === "admin" ? "Demote to User?" : "Promote to Admin?"}
          message={user.role === "admin"
            ? `${user.email} will lose all admin privileges immediately. Their active sessions remain valid but they will no longer be able to access the admin panel.`
            : `${user.email} will gain full admin access — they can view all users, billing data, and trigger syncs. Only grant this to trusted team members.`}
          confirmLabel={user.role === "admin" ? "Demote to User" : "Promote to Admin"}
          confirmCls={user.role === "admin"
            ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
            : "bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20"}
          loading={busy}
          onConfirm={handleChangeRole}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "exchange" && (
        <ConfirmModal
          title="Disconnect Exchange?"
          message={`This will remove all exchange API credentials for ${user.email}. Their trade history and billing records will be preserved, but live sync will stop. This cannot be undone without the user reconnecting.`}
          confirmLabel="Disconnect Exchange"
          confirmCls="bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
          loading={busy}
          onConfirm={handleDisconnectExchange}
          onCancel={() => setConfirm(null)}
        />
      )}
      {showSuspend && (
        <SuspendModal
          user={user}
          onClose={() => setShowSuspend(false)}
          onSuccess={() => { setShowSuspend(false); showToast("✓ Account suspended"); onRefresh(); }}
        />
      )}
      {confirm === "unblock" && (
        <ConfirmModal
          title="Reinstate Account?"
          message={`This will lift all suspensions and blocks for ${user.email}. They will immediately regain full access to AlgoFin.`}
          confirmLabel="Reinstate Account"
          confirmCls="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
          loading={busy}
          onConfirm={handleUnblock}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "remove" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => { setConfirm(null); setRemoveEmail(""); setRemoveStep(1); }}>
          <div className="w-full max-w-md bg-[#0f1117] border border-rose-500/20 rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
              <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-rose-400">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Remove Account</p>
                <p className="text-xs text-rose-400/60">Step {removeStep} of 2 — {removeStep === 1 ? "Confirm target" : "Type email to verify"}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full transition-colors ${removeStep >= 1 ? "bg-rose-400" : "bg-rose-400/25"}`} />
                <span className={`w-1.5 h-1.5 rounded-full transition-colors ${removeStep >= 2 ? "bg-rose-400" : "bg-rose-400/25"}`} />
              </div>
            </div>

            {/* Step 1 — confirm target */}
            {removeStep === 1 && (
              <>
                <div className="px-5 py-5 space-y-4">
                  <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/3 border border-white/8 select-text cursor-text">
                    <Avatar name={user.full_name} email={user.email} id={user.id} size="md" />
                    <div className="min-w-0 flex-1 select-text">
                      <p className="text-sm font-semibold text-foreground truncate">{user.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground/70 truncate select-all cursor-text">{user.email}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                      user.role === "admin" ? "bg-rose-500/15 text-rose-400 border border-rose-500/25" : "bg-white/5 text-muted-foreground"
                    }`}>{user.role === "admin" ? "Admin" : "User"}</span>
                  </div>
                  <div className="px-3.5 py-3 rounded-xl bg-rose-500/8 border border-rose-500/15">
                    <p className="text-[11px] text-rose-400 font-semibold mb-1">⚠ Permanent deletion</p>
                    <p className="text-[11px] text-rose-400/70 leading-relaxed">
                      This will permanently erase all data for this account — exchange connections, trade history, billing records and audit logs.{" "}
                      <span className="text-rose-400 font-medium">This cannot be undone.</span>
                    </p>
                  </div>
                </div>
                <div className="px-5 py-3.5 border-t border-white/8 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground/50">Do you want to remove this account?</p>
                  <div className="flex gap-2">
                    <button onClick={() => { setConfirm(null); setRemoveStep(1); }}
                      className="px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all">
                      No, Cancel
                    </button>
                    <button onClick={() => setRemoveStep(2)}
                      className="px-4 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/25 text-rose-400 text-xs font-semibold hover:bg-rose-500/25 transition-all">
                      Yes, Continue →
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Step 2 — type email to confirm */}
            {removeStep === 2 && (
              <>
                <div className="px-5 py-5 space-y-4">
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/3 border border-white/8 select-text cursor-text">
                    <Avatar name={user.full_name} email={user.email} id={user.id} size="sm" />
                    <p className="text-xs text-muted-foreground select-all cursor-text">{user.email}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Type the user&apos;s email to confirm removal
                    </label>
                    <input
                      autoFocus
                      type="email"
                      value={removeEmail}
                      onChange={(e) => setRemoveEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && removeEmail.trim().toLowerCase() === user.email.trim().toLowerCase()) handleRemove();
                      }}
                      placeholder={user.email}
                      className="w-full px-3 py-2.5 rounded-lg bg-white/4 border border-white/10 text-xs text-foreground placeholder:text-muted-foreground/25 outline-none focus:border-rose-500/40 transition-all"
                    />
                    {removeEmail.length > 0 && removeEmail.trim().toLowerCase() !== user.email.trim().toLowerCase() && (
                      <p className="text-[10px] text-rose-400/70 mt-1.5 ml-0.5">Email does not match</p>
                    )}
                    {removeEmail.trim().toLowerCase() === user.email.trim().toLowerCase() && removeEmail.length > 0 && (
                      <p className="text-[10px] text-emerald-400/70 mt-1.5 ml-0.5">✓ Email confirmed</p>
                    )}
                  </div>
                </div>
                <div className="px-5 py-3.5 border-t border-white/8 flex items-center justify-between">
                  <button onClick={() => { setRemoveStep(1); setRemoveEmail(""); }} disabled={busy}
                    className="text-xs text-muted-foreground hover:text-foreground transition-all flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                    Back
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => { setConfirm(null); setRemoveEmail(""); setRemoveStep(1); }} disabled={busy}
                      className="px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all">
                      Cancel
                    </button>
                    <button
                      onClick={handleRemove}
                      disabled={busy || removeEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()}
                      className="px-4 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/25 text-rose-400 text-xs font-semibold hover:bg-rose-500/25 transition-all disabled:opacity-30 flex items-center gap-1.5">
                      {busy && <span className="w-3 h-3 border border-rose-400/30 border-t-rose-400 rounded-full animate-spin" />}
                      Permanently Remove
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="w-7 h-7 rounded-lg bg-white/0 hover:bg-white/8 flex items-center justify-center transition-all text-muted-foreground opacity-0 group-hover:opacity-100">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-8 z-50 w-52 bg-[#0f1117] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1">
          {menuItem(
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
            "View User Details",
            () => { setOpen(false); onViewDetails(); }
          )}
          {menuItem(
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>,
            "Trigger Sync",
            handleTriggerSync
          )}
          {menuItem(
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
            "Force Logout",
            handleForceLogout
          )}
          <Divider />
          {menuItem(
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
            "Disconnect Exchange",
            () => { setOpen(false); setConfirm("exchange"); },
            user.exchange_accounts === 0
              ? "text-muted-foreground/30 cursor-not-allowed"
              : "text-foreground/80 hover:text-foreground hover:bg-white/5"
          )}
          {!isMe && user.role === "admin" && menuItem(
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
            "Demote to User",
            () => { setOpen(false); setConfirm("role"); },
            "text-amber-400 hover:bg-amber-500/8"
          )}
          {!isMe && (
            <>
              <Divider />
              {isBlocked
                ? menuItem(
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 11 12 14 22 4"/></svg>,
                    "Unblock Account",
                    () => { setOpen(false); setConfirm("unblock"); },
                    "text-emerald-400 hover:bg-emerald-500/8"
                  )
                : menuItem(
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
                    "Disable Account",
                    () => { setOpen(false); setShowSuspend(true); },
                    "text-rose-400 hover:bg-rose-500/8"
                  )
              }
              <Divider />
              {menuItem(
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
                "Remove Account",
                () => { setOpen(false); setRemoveEmail(""); setRemoveStep(1); setConfirm("remove"); },
                "text-rose-500 hover:bg-rose-500/10 font-medium"
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Users Table ───────────────────────────────────────────────────
function UsersTable({ currentUserId, onViewDetails }: { currentUserId: string; onViewDetails?: (userId: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 8;

  const load = useCallback(() => {
    setLoading(true);
    api.get<{ data: AdminUser[] }>(`/admin/users?_t=${Date.now()}`)
      .then((r) => setUsers(r.data.data))
      .catch((e) => console.error("Failed to load admin users:", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter((u) =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.full_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  if (loading) return <Spinner />;

  return (
    <>
      {selected && <UserDetailModal userId={selected} onClose={() => setSelected(null)} onRefresh={load} />}
      <div className="rounded-2xl border border-white/8 overflow-hidden bg-[#0c0e13]">
        {/* Top bar */}
        <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Users</p>
            <p className="text-[11px] text-muted-foreground">Manage platform users and their access</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by name or email..."
                className="pl-7 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/8 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/30 w-52 transition-all" />
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/8 text-xs text-muted-foreground hover:text-foreground hover:bg-white/8 transition-all">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
              </svg>
              Filter
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-all">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add User
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[2.2fr_1fr_1fr_1.6fr_0.8fr_1fr_1fr_0.5fr] gap-2 px-5 py-2.5 bg-white/[0.018] border-b border-white/5">
          {["USER","ROLE","STATUS","EXCHANGE","ACCOUNTS","LAST SYNC","JOINED","ACTIONS"].map((h) => (
            <span key={h} className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">{h}</span>
          ))}
        </div>

        {/* Rows */}
        <div className="divide-y divide-white/[0.04]">
          {paginated.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              {search ? "No users match your search." : "No users found."}
            </div>
          ) : paginated.map((u) => {
            const isMe = u.id === currentUserId;
            const syncColor = u.last_sync_status === "success" ? "text-emerald-400" : u.last_sync_status === "error" ? "text-rose-400" : "text-amber-400";
            return (
              <div key={u.id}
                className="grid grid-cols-[2.2fr_1fr_1fr_1.6fr_0.8fr_1fr_1fr_0.5fr] gap-2 px-5 py-3 hover:bg-white/[0.022] transition-colors items-center group cursor-pointer"
                onClick={() => setSelected(u.id)}>
                {/* User */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={u.full_name} email={u.email} id={u.id} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-foreground truncate">{u.full_name || "—"}</p>
                      {isMe && <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-bold shrink-0">You</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground/65 truncate">{u.email}</p>
                  </div>
                </div>
                {/* Role */}
                <div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    u.role === "admin" ? "bg-rose-500/15 text-rose-400 border border-rose-500/25" : "bg-white/5 text-muted-foreground"
                  }`}>{u.role === "admin" ? "Admin" : "User"}</span>
                </div>
                {/* Status */}
                <div className="flex items-center gap-1.5">
                  {u.is_permanently_blocked ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      <span className="text-xs text-rose-400 font-medium">Blocked</span>
                    </>
                  ) : u.suspended_until ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span className="text-xs text-amber-400 font-medium">Suspended</span>
                    </>
                  ) : u.is_active ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span className="text-xs text-emerald-400">Active</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
                      <span className="text-xs text-muted-foreground/40">Inactive</span>
                    </>
                  )}
                </div>
                {/* Exchange */}
                <div className="flex items-center gap-1.5">
                  {u.exchange_accounts > 0 ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-sm bg-amber-400/20 flex items-center justify-center flex-shrink-0">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </div>
                      <span className="text-xs text-muted-foreground truncate">Binance Futures</span>
                    </>
                  ) : <span className="text-xs text-muted-foreground/30">—</span>}
                </div>
                {/* Accounts */}
                <span className="text-xs font-semibold text-foreground">{u.exchange_accounts}</span>
                {/* Last Sync */}
                <div>
                  {u.last_sync_at
                    ? <span className={`text-xs font-medium ${syncColor}`}>{relativeTime(u.last_sync_at)}</span>
                    : <span className="text-xs text-muted-foreground/30">Never</span>}
                </div>
                {/* Joined */}
                <span className="text-[11px] text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}
                </span>
                {/* Actions */}
                <UserActionsDropdown
                  user={u}
                  currentUserId={currentUserId}
                  onViewDetails={() => setSelected(u.id)}
                  onRefresh={load}
                />
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Showing {filtered.length > 0 ? (page - 1) * perPage + 1 : 0} to {Math.min(page * perPage, filtered.length)} of {filtered.length} users
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="w-6 h-6 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center text-muted-foreground hover:bg-white/8 transition-all disabled:opacity-30">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => setPage(p)}
                className={`w-6 h-6 rounded-lg text-xs font-semibold transition-all ${
                  p === page ? "bg-primary text-black" : "bg-white/5 border border-white/8 text-muted-foreground hover:bg-white/8"
                }`}>{p}</button>
            ))}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="w-6 h-6 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center text-muted-foreground hover:bg-white/8 transition-all disabled:opacity-30">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Overview Bottom Panels ────────────────────────────────────────
function OverviewPanels({ users, syncData, activity }: {
  users: AdminUser[];
  syncData: { summary: any; recent_runs: SyncRun[] } | null;
  activity: ActivityRow[];
}) {
  const ranked = [...users].filter((u) => u.exchange_accounts > 0).slice(0, 5);
  const syncs = syncData?.recent_runs ?? [];
  const healthy = syncs.filter((s) => s.status === "success").length;
  const stale = syncs.filter((s) => s.status === "partial" || s.status === "running").length;
  const failed = syncs.filter((s) => s.status === "error").length;
  const disconnected = Math.max(0, syncs.length - healthy - stale - failed);
  const donutData = [
    { label: "Healthy", value: healthy, color: "#34d399" },
    { label: "Stale", value: stale, color: "#fbbf24" },
    { label: "Failed", value: failed, color: "#f87171" },
    { label: "Disconnected", value: disconnected, color: "#6b7280" },
  ];
  const mockPnl = [3210.45, 1245.30, 845.20, 512.10, 210.80];

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* PnL Leaderboard */}
      <div className="rounded-2xl border border-white/8 bg-[#0c0e13] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/6">
          <p className="text-sm font-semibold text-foreground">
            Top Users by PnL <span className="text-muted-foreground font-normal text-xs">(This Month)</span>
          </p>
        </div>
        <div className="p-4 space-y-3.5">
          {ranked.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No data.</p>
          ) : ranked.map((u, i) => (
            <div key={u.id} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground/45 w-4 text-center font-mono">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-foreground truncate">{u.full_name || u.email.split("@")[0]}</span>
                  <span className="text-xs font-bold text-emerald-400 ml-2 shrink-0">${fmt(mockPnl[i] ?? 0)}</span>
                </div>
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-700"
                    style={{ width: `${100 - i * 18}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-white/5">
          <button className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">View All</button>
        </div>
      </div>

      {/* Sync Donut */}
      <div className="rounded-2xl border border-white/8 bg-[#0c0e13] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/6">
          <p className="text-sm font-semibold text-foreground">Sync Health Overview</p>
        </div>
        <div className="p-5 flex items-center justify-center min-h-[168px]">
          <DonutChart data={donutData} />
        </div>
        <div className="px-5 py-3 border-t border-white/5">
          <button className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">View All Sync Jobs</button>
        </div>
      </div>

      {/* Recent Audit Logs */}
      <div className="rounded-2xl border border-white/8 bg-[#0c0e13] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Recent Audit Logs</p>
          <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">View All</button>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {activity.slice(0, 5).map((a) => {
            const actor = a.event.startsWith("login") ? "Admin"
              : a.event.includes("sync") || a.event.includes("billing") ? "System"
              : "User";
            const actorCls = actor === "Admin" ? "bg-rose-500/20 text-rose-400"
              : actor === "System" ? "bg-blue-500/20 text-blue-400"
              : "bg-white/10 text-muted-foreground";
            return (
              <div key={a.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.015] transition-colors">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 mt-0.5 ${actorCls}`}>
                  {actor[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-foreground/80 leading-relaxed">
                    <span className="font-semibold capitalize">{actor}</span>{" "}
                    <span className="text-muted-foreground/65">{a.event.replace(/_/g, " ")}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground/45 truncate">{a.user_email}</p>
                </div>
                <span className="text-[10px] text-muted-foreground/40 flex-shrink-0">{relativeTime(a.created_at)}</span>
              </div>
            );
          })}
          {activity.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No audit events yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sync Tab ──────────────────────────────────────────────────────
function SyncTab() {
  const [data, setData] = useState<{ summary: any; recent_runs: SyncRun[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    api.get<{ data: any }>("/admin/sync/status").then((r) => setData(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (loading) return <Spinner />;
  if (!data) return <div className="text-center py-12 text-sm text-muted-foreground">No sync data.</div>;
  const SC: Record<string, string> = {
    success: "text-emerald-400 bg-emerald-400/10",
    error: "text-rose-400 bg-rose-400/10",
    running: "text-amber-400 bg-amber-400/10",
    partial: "text-amber-400 bg-amber-400/10",
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Runs", value: data.summary.total_runs, sub: "all time" },
          { label: "Error Runs", value: data.summary.error_runs, sub: "failures", danger: data.summary.error_runs > 0 },
          { label: "Success Rate", value: data.summary.success_rate, sub: "this period" },
        ].map(({ label, value, sub, danger }) => (
          <div key={label} className="rounded-2xl border border-white/8 bg-[#0c0e13] px-5 py-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold ${danger ? "text-rose-400" : "text-foreground"}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground/45 mt-1">{sub}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-white/8 bg-[#0c0e13] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Recent Sync Runs</p>
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.95" />
            </svg>
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-2.5 bg-white/[0.018] border-b border-white/5">
          {["ACCOUNT","TYPE","STATUS","ROWS","TIME"].map((h) => (
            <span key={h} className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">{h}</span>
          ))}
        </div>
        <div className="divide-y divide-white/[0.04]">
          {data.recent_runs.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No sync runs yet.</div>
          ) : data.recent_runs.map((r) => (
            <div key={r.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-3 hover:bg-white/[0.018] items-center">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{r.exchange_account}</p>
                <p className="text-[10px] text-muted-foreground/50 truncate">{r.user_email}</p>
              </div>
              <span className="text-xs font-mono text-muted-foreground">{r.sync_type}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${SC[r.status] ?? "text-muted-foreground bg-white/5"}`}>{r.status}</span>
              <span className="text-xs text-foreground">{r.rows_processed}</span>
              <div>
                <p className="text-xs text-muted-foreground">{relativeTime(r.started_at)}</p>
                {r.error_message && (
                  <p className="text-[10px] text-rose-400 truncate max-w-[100px]" title={r.error_message}>{r.error_message}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Billing Tab ───────────────────────────────────────────────────
function BillingTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<{ data: any }>("/admin/billing/overview").then((r) => setData(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner />;
  if (!data) return <div className="text-center py-12 text-sm text-muted-foreground">No billing data.</div>;
  const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 rounded-2xl border border-white/8 bg-[#0c0e13] px-6 py-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Monthly Fee ({month})</p>
          <p className="text-3xl font-bold text-foreground">
            ${fmt(data.total_estimated_fee_usdt)}
            <span className="text-sm font-normal text-muted-foreground ml-1">USDT</span>
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 font-semibold">Pending</span>
            <span className="text-xs text-muted-foreground">{data.period_start} → {data.period_end}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-[#0c0e13] px-5 py-5 text-center flex flex-col items-center justify-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Billing Users</p>
          <p className="text-3xl font-bold text-foreground">{data.active_billing_users}</p>
          <p className="text-xs text-muted-foreground mt-1">with active consent</p>
        </div>
      </div>
      <div className="px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/15 text-xs text-amber-300">
        <strong>Shadow billing only.</strong> No payment is collected in v1 beta.
      </div>
      <div className="rounded-2xl border border-white/8 bg-[#0c0e13] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/6">
          <p className="text-sm font-semibold text-foreground">Per-User Breakdown</p>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-5 py-2.5 bg-white/[0.018] border-b border-white/5">
          {["USER","ACCOUNTS","REALIZED PNL","EST. FEE"].map((h) => (
            <span key={h} className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">{h}</span>
          ))}
        </div>
        <div className="divide-y divide-white/[0.04]">
          {data.users.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No users with billing consent.</div>
          ) : (data.users as BillingUser[]).map((u) => (
            <div key={u.user_id} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-5 py-3 hover:bg-white/[0.018] items-center">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{u.user_email}</p>
                {!u.is_complete && <p className="text-[10px] text-amber-400">⚠ Incomplete</p>}
              </div>
              <span className="text-xs text-foreground">{u.consented_accounts}</span>
              <span className={`text-xs font-semibold ${u.total_realized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {u.total_realized_pnl >= 0 ? "+" : ""}${fmt(u.total_realized_pnl)}
              </span>
              <span className="text-xs font-semibold text-foreground">${fmt(u.performance_fee_amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Audit Log Tab ─────────────────────────────────────────────────
function AuditLogTab() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const load = useCallback(() => {
    setLoading(true);
    api.get<{ data: ActivityRow[] }>("/admin/activity").then((r) => setRows(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  const EC: Record<string, string> = {
    login_success: "text-emerald-400 bg-emerald-400/10",
    login_failed: "text-rose-400 bg-rose-400/10",
    logout: "text-muted-foreground bg-white/5",
    token_refreshed: "text-blue-400 bg-blue-400/10",
    password_changed: "text-amber-400 bg-amber-400/10",
  };
  const filtered = rows.filter((r) =>
    !search || r.user_email.toLowerCase().includes(search.toLowerCase()) || r.event.toLowerCase().includes(search.toLowerCase())
  );
  if (loading) return <Spinner />;
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0c0e13] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">Platform Login Activity</p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter..."
              className="pl-7 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/8 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/30 w-44 transition-all" />
          </div>
          <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2">Refresh</button>
        </div>
      </div>
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-5 py-2.5 bg-white/[0.018] border-b border-white/5">
        {["USER","EVENT","IP ADDRESS","TIME"].map((h) => (
          <span key={h} className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">{h}</span>
        ))}
      </div>
      <div className="divide-y divide-white/[0.04]">
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">{search ? "No results." : "No activity yet."}</div>
        ) : filtered.map((r) => (
          <div key={r.id} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-5 py-3 hover:bg-white/[0.018] items-center">
            <p className="text-xs font-medium text-foreground truncate">{r.user_email}</p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${EC[r.event] ?? "text-muted-foreground bg-white/5"}`}>
              {r.event.replace(/_/g, " ")}
            </span>
            <span className="text-xs font-mono text-muted-foreground/50">{r.ip_address || "—"}</span>
            <span className="text-xs text-muted-foreground">{relativeTime(r.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Strategies Tab ────────────────────────────────────────────────
function StrategiesTab() {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0c0e13] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Strategy Management</p>
          <p className="text-xs text-muted-foreground">Manage influencer strategies and marketplace</p>
        </div>
        <Link href="/admin/influencer" className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-all">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
          </svg>
          Open Influencer Panel
        </Link>
      </div>
      <div className="p-10 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
          </svg>
        </div>
        <p className="text-sm font-medium text-foreground">Manage Strategies via Influencer Panel</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Configure signal routing, risk parameters, and subscriber access from the dedicated influencer admin panel.
        </p>
        <Link href="/admin/influencer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-semibold hover:bg-cyan-500/20 transition-all mt-2">
          Go to Influencer Strategies →
        </Link>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, iconBg, subColor }: {
  label: string; value: string | number; sub: string;
  icon: React.ReactNode; iconBg: string; subColor?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0c0e13] px-4 py-4 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground/55 uppercase tracking-wider mb-1.5 leading-tight">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        <p className={`text-[11px] mt-1.5 ${subColor ?? "text-muted-foreground"}`}>{sub}</p>
      </div>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>{icon}</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
type TabName = "overview" | "users" | "sync" | "billing" | "strategies" | "audit";

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<TabName>("overview");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [syncData, setSyncData] = useState<{ summary: any; recent_runs: SyncRun[] } | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);

  useEffect(() => { if (user && user.role !== "admin") router.replace("/dashboard"); }, [user, router]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    Promise.all([
      api.get<{ data: AdminUser[] }>("/admin/users"),
      api.get<{ data: any }>("/admin/sync/status"),
      api.get<{ data: ActivityRow[] }>("/admin/activity"),
    ]).then(([ur, sr, ar]) => {
      setUsers(ur.data.data); setSyncData(sr.data.data); setActivity(ar.data.data);
    }).catch(() => {}).finally(() => setLoadingOverview(false));
  }, [user]);

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

  const activeThisMonth = users.filter((u) => {
    const d = new Date(u.created_at), n = new Date();
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  }).length;
  const activeExchanges = users.reduce((s, u) => s + u.exchange_accounts, 0);
  const failedSyncs = syncData?.recent_runs.filter((r) => r.status === "error").length ?? 0;
  const staleSyncs = syncData?.recent_runs.filter((r) => r.status === "partial").length ?? 0;
  const month = new Date().toLocaleString("en-US", { month: "short", year: "numeric" });

  const TABS: { id: TabName; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "sync", label: "Sync" },
    { id: "billing", label: "Billing" },
    { id: "strategies", label: "Strategies" },
    { id: "audit", label: "Audit Log" },
  ];

  return (
    <div className="page-content space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-rose-400">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-xs text-muted-foreground">Platform management and oversight</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button className="relative w-8 h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {activity.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 text-[8px] font-bold text-white flex items-center justify-center">
                {Math.min(activity.length, 9)}
              </span>
            )}
          </button>
          <span className="px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold">Admin</span>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Total Users" value={users.length} sub={`↑ ${activeThisMonth} this month`} subColor="text-emerald-400"
          iconBg="bg-violet-500/15 border border-violet-500/20"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-violet-400">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>} />
        <StatCard label="Active Exchange Connections" value={activeExchanges}
          sub={`↑ ${Math.max(0, activeExchanges - 2)} this week`} subColor="text-emerald-400"
          iconBg="bg-emerald-500/15 border border-emerald-500/20"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>} />
        <StatCard label="Sync Health" value={failedSyncs + staleSyncs}
          sub={failedSyncs > 0 ? `${failedSyncs} failed · ${staleSyncs} stale` : staleSyncs > 0 ? `${staleSyncs} stale` : "All healthy"}
          subColor={failedSyncs > 0 ? "text-rose-400" : staleSyncs > 0 ? "text-amber-400" : "text-emerald-400"}
          iconBg="bg-amber-500/15 border border-amber-500/20"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-400">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>} />
        <StatCard label="Active Strategies" value={24} sub="↑ 5 this week" subColor="text-emerald-400"
          iconBg="bg-cyan-500/15 border border-cyan-500/20"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
          </svg>} />
        <StatCard label={`Monthly Fee (${month})`} value="$4,812.35" sub="Pending" subColor="text-amber-400"
          iconBg="bg-emerald-500/15 border border-emerald-500/20"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400">
            <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>} />
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-0 border-b border-white/6">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-all relative ${
              tab === t.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
            {tab === t.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          {loadingOverview ? <Spinner /> : (
            <>
              <UsersTable currentUserId={user.id} />
              <OverviewPanels users={users} syncData={syncData} activity={activity} />
            </>
          )}
        </div>
      )}
      {tab === "users" && <UsersTable currentUserId={user.id} />}
      {tab === "sync" && <SyncTab />}
      {tab === "billing" && <BillingTab />}
      {tab === "strategies" && <StrategiesTab />}
      {tab === "audit" && <AuditLogTab />}
    </div>
  );
}
