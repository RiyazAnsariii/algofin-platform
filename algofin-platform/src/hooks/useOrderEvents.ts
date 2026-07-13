// src/hooks/useOrderEvents.ts
// AlgoFin v2 — Phase C: React hook for live order status updates
//
// Receives order_event messages from the MarketDataSocket (after auth).
// Updates a local map of orderId → latest status for instant UI feedback.

"use client";

import { useEffect, useCallback, useState } from "react";
import marketDataSocket, { type OrderUpdate } from "@/lib/marketDataSocket";
import { useAuthStore } from "@/stores/auth.store";

export type { OrderUpdate };

export interface UseOrderEventsReturn {
  /**
   * Map: algofinOrderId → latest live status update.
   * Use this to overlay status badges on the Orders page without refetching.
   */
  liveOrders: Record<string, OrderUpdate>;
  /** Clear the live cache (e.g., after user navigates away) */
  clearLive: () => void;
}

export function useOrderEvents(): UseOrderEventsReturn {
  const [liveOrders, setLiveOrders] = useState<Record<string, OrderUpdate>>({});
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    const handleOrder = (update: OrderUpdate) => {
      // Key by algofinOrderId if available (orders placed through us),
      // fall back to Binance orderId for externally placed orders.
      const key = update.algofinOrderId || update.orderId;
      setLiveOrders((prev) => ({ ...prev, [key]: update }));
    };

    marketDataSocket.on("order_event", handleOrder);
    // Connect is idempotent — socket already connected from useLivePrices
    marketDataSocket.connect(accessToken);

    return () => {
      marketDataSocket.off("order_event", handleOrder);
    };
  }, [accessToken]);

  const clearLive = useCallback(() => setLiveOrders({}), []);

  return { liveOrders, clearLive };
}
