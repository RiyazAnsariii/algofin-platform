// src/lib/marketDataSocket.ts
// AlgoFin v2 — Exchange-agnostic WebSocket manager
//
// Design decisions (locked):
//   - Named marketDataSocket (not priceSocket) — exchange-agnostic
//   - First-message auth: sends {type:"auth", token} right after connect
//   - Server-only heartbeat: server sends ping, client responds pong
//   - Stale update guard: tracks lastSequence[symbol], drops ≤ last seen
//   - Exponential backoff reconnect: 1s → 2s → 4s → max 30s
//   - Dynamic subscriptions via subscribe(symbols) — no reconnect needed
//   - Status: connecting → auth → connected → reconnecting → closed

type SocketStatus = "connecting" | "auth" | "connected" | "reconnecting" | "closed";

type PriceUpdateHandler = (data: {
  symbol: string;
  markPrice: number;
  sequence: number;
  exchange: string;
  eventTime: number;
}) => void;

type StatusChangeHandler = (status: SocketStatus) => void;

const WS_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/v1/marketdata/ws`
    : "";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS  = 30_000;
const PONG_TIMEOUT_MS   = 12_000; // slightly above server's 10s to account for latency

class MarketDataSocket {
  private ws: WebSocket | null = null;
  private status: SocketStatus = "closed";
  private token: string | null = null;

  // Subscriptions
  private pendingSymbols: Set<string> = new Set();
  private subscribedSymbols: Set<string> = new Set();

  // Sequence tracking for stale-event detection
  private lastSequence: Record<string, number> = {};

  // Reconnect
  private reconnectDelay = RECONNECT_BASE_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  // Heartbeat — server sends ping, we respond pong
  private pongTimer: ReturnType<typeof setTimeout> | null = null;

  // Event listeners
  private priceHandlers: Set<PriceUpdateHandler> = new Set();
  private statusHandlers: Set<StatusChangeHandler> = new Set();

  // ── Public API ──────────────────────────────────────────────────────────────

  connect(token: string): void {
    this.token = token;
    this.shouldReconnect = true;
    this._connect();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this._clearTimers();
    this.ws?.close(1000, "client_disconnect");
    this._setStatus("closed");
  }

  subscribe(symbols: string[]): void {
    const upper = symbols.map((s) => s.toUpperCase());
    upper.forEach((s) => this.pendingSymbols.add(s));

    if (this.status === "connected" && this.ws?.readyState === WebSocket.OPEN) {
      this._sendSubscribe(upper);
    }
    // If not yet connected, symbols will be sent once auth succeeds
  }

  unsubscribe(symbols: string[]): void {
    const upper = symbols.map((s) => s.toUpperCase());
    upper.forEach((s) => {
      this.pendingSymbols.delete(s);
      this.subscribedSymbols.delete(s);
    });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this._send({ type: "unsubscribe", version: 1, symbols: upper });
    }
  }

  on(event: "price_update", handler: PriceUpdateHandler): void;
  on(event: "status", handler: StatusChangeHandler): void;
  on(event: string, handler: PriceUpdateHandler | StatusChangeHandler): void {
    if (event === "price_update") this.priceHandlers.add(handler as PriceUpdateHandler);
    if (event === "status") this.statusHandlers.add(handler as StatusChangeHandler);
  }

  off(event: "price_update", handler: PriceUpdateHandler): void;
  off(event: "status", handler: StatusChangeHandler): void;
  off(event: string, handler: PriceUpdateHandler | StatusChangeHandler): void {
    if (event === "price_update") this.priceHandlers.delete(handler as PriceUpdateHandler);
    if (event === "status") this.statusHandlers.delete(handler as StatusChangeHandler);
  }

  getStatus(): SocketStatus {
    return this.status;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private _connect(): void {
    if (!WS_URL) return;
    this._setStatus("connecting");

    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      // Do NOT set status to connected yet — wait for auth_ok
      this._setStatus("auth");
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        this._handleMessage(msg);
      } catch {
        /* ignore malformed */
      }
    };

    this.ws.onclose = () => {
      this._clearPongTimer();
      if (this.shouldReconnect) {
        this._setStatus("reconnecting");
        this._scheduleReconnect();
      } else {
        this._setStatus("closed");
      }
    };

    this.ws.onerror = () => {
      // onclose will fire next — handled there
    };
  }

  private _handleMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;

    switch (type) {
      case "connected":
        // Server acknowledged connection — send auth immediately
        this._send({ type: "auth", version: 1, token: this.token });
        break;

      case "auth_ok":
        this._setStatus("connected");
        this.reconnectDelay = RECONNECT_BASE_MS; // reset backoff on success
        // Send any pending subscriptions accumulated before auth
        if (this.pendingSymbols.size > 0) {
          this._sendSubscribe([...this.pendingSymbols]);
        }
        break;

      case "auth_error":
        console.error("[MarketDataSocket] Auth failed:", msg.reason);
        this.shouldReconnect = false; // bad token — don't loop
        this._setStatus("closed");
        break;

      case "subscribed":
        if (Array.isArray(msg.symbols)) {
          (msg.symbols as string[]).forEach((s) => this.subscribedSymbols.add(s));
        }
        break;

      case "price_update": {
        const symbol = msg.symbol as string;
        const seq    = msg.sequence as number;
        // Drop stale or duplicate events
        if (this.lastSequence[symbol] !== undefined && seq <= this.lastSequence[symbol]) {
          return;
        }
        this.lastSequence[symbol] = seq;
        this.priceHandlers.forEach((h) =>
          h({
            symbol,
            markPrice: msg.markPrice as number,
            sequence:  seq,
            exchange:  msg.exchange as string,
            eventTime: msg.eventTime as number,
          })
        );
        break;
      }

      case "ping":
        // Server heartbeat — must respond with pong within 10s
        this._clearPongTimer();
        this._send({ type: "pong", version: 1 });
        // If server stops sending pings, assume connection is dead
        this.pongTimer = setTimeout(() => {
          console.warn("[MarketDataSocket] No ping received — reconnecting.");
          this.ws?.close();
        }, PONG_TIMEOUT_MS);
        break;

      case "error":
        console.warn("[MarketDataSocket] Server error:", msg.code, msg.reason);
        break;
    }
  }

  private _sendSubscribe(symbols: string[]): void {
    this._send({ type: "subscribe", version: 1, symbols });
  }

  private _send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private _setStatus(status: SocketStatus): void {
    this.status = status;
    this.statusHandlers.forEach((h) => h(status));
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) this._connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private _clearTimers(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this._clearPongTimer();
  }

  private _clearPongTimer(): void {
    if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
const marketDataSocket = new MarketDataSocket();
export default marketDataSocket;
