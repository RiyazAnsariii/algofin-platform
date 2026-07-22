"use client";
// src/app/(app)/orders/page.tsx
// AlgoFin v2 — Phase B+C: Order Management + Live Order Event Streaming
// Orders placed through AlgoFin show live FILLED/CANCELLED status via WebSocket.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useOrderEvents } from "@/hooks/useOrderEvents";
import marketDataSocket from "@/lib/marketDataSocket";
import { useAuthStore } from "@/stores/auth.store";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

// ── Types ─────────────────────────────────────────────────────────
interface Order {
  id:                 string;
  exchange_account_id: string;
  binance_order_id:   string | null;
  symbol:             string;
  side:               "BUY" | "SELL";
  order_type:         "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";
  quantity:           string;
  price:              string | null;
  reduce_only:        boolean;
  time_in_force:      string | null;
  status:             string;
  filled_quantity:    string;
  avg_fill_price:     string | null;
  error_message:      string | null;
  placed_at:          string;
}

interface ExchangeAccount {
  id:          string;
  label:       string;
  exchange_id: string;
}

// ── Helpers ────────────────────────────────────────────────────────
const fmt = (n: string | number | null | undefined, d = 4) => {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};

const statusColor = (s: string) => {
  switch (s) {
    case "NEW":              return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    case "PARTIALLY_FILLED": return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "FILLED":           return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    case "CANCELLED":
    case "EXPIRED":          return "bg-muted/30 text-muted-foreground border-white/10";
    case "REJECTED":         return "bg-rose-500/15 text-rose-400 border-rose-500/20";
    default:                 return "bg-muted/30 text-muted-foreground border-white/10";
  }
};

// ── Place Order form ───────────────────────────────────────────────
function PlaceOrderForm({
  accounts,
  onSuccess,
}: {
  accounts: ExchangeAccount[];
  onSuccess: () => void;
}) {
  const [accountId, setAccountId]     = useState(accounts[0]?.id ?? "");
  const [symbol, setSymbol]           = useState("BTCUSDT");
  const [side, setSide]               = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType]     = useState<"MARKET" | "LIMIT">("LIMIT");
  const [quantity, setQuantity]       = useState("");
  const [price, setPrice]             = useState("");
  const [reduceOnly, setReduceOnly]   = useState(false);
  const [tif, setTif]                 = useState("GTC");
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      await api.post("/orders", {
        exchange_account_id: accountId,
        symbol: symbol.toUpperCase(),
        side,
        order_type: orderType,
        quantity: Number(quantity),
        price: orderType === "LIMIT" ? Number(price) : undefined,
        reduce_only: reduceOnly,
        time_in_force: orderType === "LIMIT" ? tif : undefined,
      });
      setSuccess(true);
      setQuantity("");
      setPrice("");
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Order placement failed");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors";
  const labelCls = "block text-xs font-medium text-muted-foreground mb-1.5";

  return (
    <div className="surface-card p-6">
      <h2 className="text-sm font-semibold text-foreground mb-5">Place Order</h2>

      {success && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
          ✓ Order submitted to Binance
        </div>
      )}
      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Account */}
        <div>
          <label className={labelCls}>Exchange Account</label>
          <select
            id="order-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={inputCls}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>

        {/* Symbol */}
        <div>
          <label className={labelCls}>Symbol</label>
          <input
            id="order-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="BTCUSDT"
            className={inputCls}
          />
        </div>

        {/* Side + Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Side</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["BUY", "SELL"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  id={`order-side-${s.toLowerCase()}`}
                  onClick={() => setSide(s)}
                  className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                    side === s
                      ? s === "BUY"
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                        : "bg-rose-500/20 border-rose-500/40 text-rose-400"
                      : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["LIMIT", "MARKET"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  id={`order-type-${t.toLowerCase()}`}
                  onClick={() => setOrderType(t)}
                  className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                    orderType === t
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className={labelCls}>Quantity</label>
          <input
            id="order-quantity"
            type="number"
            step="any"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0.001"
            required
            className={inputCls}
          />
        </div>

        {/* Price — shown for LIMIT only */}
        {orderType === "LIMIT" && (
          <>
            <div>
              <label className={labelCls}>Limit Price (USDT)</label>
              <input
                id="order-price"
                type="number"
                step="any"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="60000.00"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Time in Force</label>
              <select
                id="order-tif"
                value={tif}
                onChange={(e) => setTif(e.target.value)}
                className={inputCls}
              >
                <option value="GTC">GTC — Good Till Cancelled</option>
                <option value="IOC">IOC — Immediate or Cancel</option>
                <option value="FOK">FOK — Fill or Kill</option>
                <option value="GTX">GTX — Post Only</option>
              </select>
            </div>
          </>
        )}

        {/* Reduce only */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            id="order-reduce-only"
            type="checkbox"
            checked={reduceOnly}
            onChange={(e) => setReduceOnly(e.target.checked)}
            className="w-4 h-4 rounded border-white/20"
          />
          <span className="text-xs text-muted-foreground">Reduce Only</span>
        </label>

        <button
          id="order-submit"
          type="submit"
          disabled={submitting}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
            side === "BUY"
              ? "bg-emerald-500 hover:bg-emerald-400 text-white"
              : "bg-rose-500 hover:bg-rose-400 text-white"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {submitting ? "Submitting…" : `${side} ${symbol}`}
        </button>
      </form>
    </div>
  );
}

// ── Order row ──────────────────────────────────────────────────────
function OrderRow({
  order,
  onCancel,
  liveStatus,
}: {
  order: Order;
  onCancel: (id: string) => void;
  liveStatus?: string;
}) {
  const [cancelling, setCancelling] = useState(false);
  // Use live status from WebSocket if available, fall back to last polled
  const displayStatus = liveStatus ?? order.status;
  const isLiveUpdate  = liveStatus !== undefined && liveStatus !== order.status;
  const canCancel = (liveStatus ?? order.status) === "NEW" ||
                    (liveStatus ?? order.status) === "PARTIALLY_FILLED";

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await onCancel(order.id);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm border-b border-white/4 last:border-0 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${statusColor(displayStatus)}`}>
            {displayStatus}
          </span>
          {/* Live pulse indicator when WS delivered a new status */}
          {isLiveUpdate && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Live update" />
          )}
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
          order.side === "BUY"
            ? "bg-emerald-500/15 text-emerald-400"
            : "bg-rose-500/15 text-rose-400"
        }`}>
          {order.side}
        </span>
        <span className="font-medium text-foreground">{order.symbol}</span>
        <span className="text-muted-foreground text-xs hidden sm:inline">{order.order_type}</span>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
        <span>Qty: <span className="text-foreground">{fmt(order.quantity, 6)}</span></span>
        {order.price && <span className="hidden md:inline">@${fmt(order.price, 2)}</span>}
        {order.status === "FILLED" && order.avg_fill_price && (
          <span className="text-emerald-400 hidden lg:inline">Fill: ${fmt(order.avg_fill_price, 2)}</span>
        )}
        {canCancel && (
          <button
            id={`cancel-order-${order.id}`}
            onClick={handleCancel}
            disabled={cancelling}
            className="px-2 py-1 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] font-semibold transition-all disabled:opacity-50"
          >
            {cancelling ? "…" : "Cancel"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Orders page ──────────────────────────────────────────────────
export default function OrdersPage() {
  const [orders, setOrders]     = useState<Order[]>([]);
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [loading, setLoading]   = useState(true);
  const showSkeleton             = useDelayedLoading(loading);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const accessToken = useAuthStore((s) => s.accessToken);

  // Phase C: live order status overlays from WebSocket
  const { liveOrders } = useOrderEvents();

  // Ensure WS is connected on this page too
  useEffect(() => {
    if (accessToken) marketDataSocket.connect(accessToken);
  }, [accessToken]);

  const wsStatus = marketDataSocket.getStatus();

  const fetchOrders = useCallback(async () => {
    try {
      const qStatus = statusFilter === "open" ? "NEW" : statusFilter === "all" ? undefined : statusFilter;
      const params = qStatus ? `?status=${qStatus}` : "";
      const res = await api.get<{ data: Order[] }>(`/orders${params}`);
      setOrders(res.data.data);
    } catch {
      /* handled */
    }
  }, [statusFilter]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await api.get<{ data: ExchangeAccount[] }>("/exchanges");
      setAccounts(res.data.data);
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 15_000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleCancel = async (orderId: string) => {
    await api.delete(`/orders/${orderId}`);
    await fetchOrders();
  };

  const noAccounts = !loading && accounts.length === 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Orders</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">
              Place and manage Binance USDT-M Futures orders
            </p>
            {/* Phase C: Live WS status */}
            {wsStatus === "connected" && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold
                bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* No account */}
      {noAccounts && (
        <div className="surface-card p-8 text-center space-y-3">
          <p className="font-semibold text-foreground">No exchange account connected</p>
          <p className="text-sm text-muted-foreground">Connect your Binance account to place orders.</p>
          <Link href="/exchanges" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all">
            Connect account →
          </Link>
        </div>
      )}

      {!noAccounts && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order form */}
          {accounts.length > 0 && (
            <div className="lg:col-span-1">
              <PlaceOrderForm accounts={accounts} onSuccess={fetchOrders} />
            </div>
          )}

          {/* Order list */}
          <div className="lg:col-span-2 surface-card overflow-hidden">
            {/* Filters */}
            <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">Order History</h2>
              <div className="flex gap-1">
                {["open", "all", "FILLED", "CANCELLED"].map((f) => (
                  <button
                    key={f}
                    id={`filter-${f}`}
                    onClick={() => setStatusFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                      statusFilter === f
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
                    }`}
                  >
                    {f === "open" ? "Open" : f === "all" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders */}
            {showSkeleton ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="skeleton h-10 w-full" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No orders found
              </div>
            ) : (
              <div className="animate-fade-in">
                {orders.map((o) => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    onCancel={handleCancel}
                    liveStatus={liveOrders[o.id]?.status}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
