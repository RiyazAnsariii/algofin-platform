// src/hooks/useLivePrices.ts
// AlgoFin v2 — React hook for real-time mark prices
//
// Returns live mark prices from the MarketDataSocket singleton.
// PnL calculation here is DISPLAY-ONLY — never used for billing or reports.
// All authoritative PnL comes from the backend realizedPnl field.

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import marketDataSocket from "@/lib/marketDataSocket";
import { useAuthStore } from "@/stores/auth.store";

type SocketStatus = "connecting" | "auth" | "connected" | "reconnecting" | "closed";

export interface LivePrice {
  markPrice:  number;
  exchange:   string;
  eventTime:  number;
  sequence:   number;
}

export interface UseLivePricesReturn {
  /** symbol → latest mark price data */
  prices: Record<string, LivePrice>;
  /** current WebSocket connection status */
  status: SocketStatus;
  /** subscribe to additional symbols at any time (no reconnect) */
  subscribe: (symbols: string[]) => void;
  /**
   * Display-only estimated live PnL.
   * Formula: (markPrice - entryPrice) × size
   * NEVER use this for billing, reports, or backend calls.
   */
  calcEstLivePnl: (symbol: string, entryPrice: number, size: number, side: "long" | "short") => number | null;
}

export function useLivePrices(initialSymbols: string[] = []): UseLivePricesReturn {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const [status, setStatus] = useState<SocketStatus>("closed");
  const accessToken = useAuthStore((s) => s.accessToken);
  const subscribedRef = useRef<Set<string>>(new Set());

  // ── Connect on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) return;

    const handlePrice = (data: LivePrice & { symbol: string }) => {
      setPrices((prev) => ({
        ...prev,
        [data.symbol]: {
          markPrice: data.markPrice,
          exchange:  data.exchange,
          eventTime: data.eventTime,
          sequence:  data.sequence,
        },
      }));
    };

    const handleStatus = (s: SocketStatus) => setStatus(s);

    marketDataSocket.on("price_update", handlePrice);
    marketDataSocket.on("status", handleStatus);

    // Connect (idempotent — singleton reconnects if already connected)
    marketDataSocket.connect(accessToken);

    return () => {
      marketDataSocket.off("price_update", handlePrice);
      marketDataSocket.off("status", handleStatus);
    };
  }, [accessToken]);

  // ── Subscribe to initial symbols ────────────────────────────────────────────
  useEffect(() => {
    if (initialSymbols.length === 0) return;
    const newSymbols = initialSymbols.filter((s) => !subscribedRef.current.has(s));
    if (newSymbols.length === 0) return;
    newSymbols.forEach((s) => subscribedRef.current.add(s));
    marketDataSocket.subscribe(newSymbols);
  }, [initialSymbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dynamic subscribe (called from component) ───────────────────────────────
  const subscribe = useCallback((symbols: string[]) => {
    const newSymbols = symbols.filter((s) => !subscribedRef.current.has(s));
    if (newSymbols.length === 0) return;
    newSymbols.forEach((s) => subscribedRef.current.add(s));
    marketDataSocket.subscribe(newSymbols);
  }, []);

  // ── Display-only PnL calc ───────────────────────────────────────────────────
  const calcEstLivePnl = useCallback(
    (symbol: string, entryPrice: number, size: number, side: "long" | "short"): number | null => {
      const live = prices[symbol];
      if (!live) return null;
      const diff = live.markPrice - entryPrice;
      return side === "long" ? diff * size : -diff * size;
    },
    [prices]
  );

  return { prices, status, subscribe, calcEstLivePnl };
}
