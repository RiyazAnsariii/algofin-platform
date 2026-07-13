════════════════════════════════════════════════════════════
PART 0 — WHAT ALGOFIN ACTUALLY IS (v1 identity, locked)
════════════════════════════════════════════════════════════

AlgoFin v1 is a portfolio-aware trading operating layer for active
Binance Futures traders.

It is NOT an algorithmic execution platform.
It is NOT a strategy automation engine.
It is NOT an AI trading system.

Those are future layers. They are not v1.

What v1 actually does:

  1. Connects to the trader's Binance Futures account
  2. Syncs real account state: balances, open positions, recent trades
  3. Shows a live dashboard with account performance and PnL
  4. Surfaces upcoming high-impact macro events (economic calendar)
  5. Provides an AI assistant that answers portfolio-specific questions
     using only real platform data (portfolio + events)
  6. Displays an estimated monthly fee summary based on realized PnL

The wedge — why a trader should care:

  AlgoFin combines four things in one workflow that traders currently
  split across four separate tools:

  ┌─────────────────────────────────────────────────────────┐
  │  Real Binance Futures account data (balance, positions, │
  │  trades, PnL) — not public price data, their account   │
  ├─────────────────────────────────────────────────────────┤
  │  Upcoming high-impact macro events that move the market │
  │  (economic calendar, red-folder style)                  │
  ├─────────────────────────────────────────────────────────┤
  │  An AI assistant that understands THEIR portfolio       │
  │  context — not generic market commentary                │
  ├─────────────────────────────────────────────────────────┤
  │  All in one place, not spread across Binance +          │
  │  TradingView + Forex Factory + ChatGPT                  │
  └─────────────────────────────────────────────────────────┘

  That is the actual product. That is the value proposition.
  The product position is: "the one dashboard that knows your account."

════════════════════════════════════════════════════════════
PART 0-A — LOCKED DECISIONS (source of truth, updated 2026-07-10)
════════════════════════════════════════════════════════════
These decisions are FINAL for v1. Any older section below that
contradicts these is superseded by this block.

  Exchange / account scope (v1 — HARD LOCK):
                        Binance USDT-M Futures ONLY.

                        Supported in v1:
                          - Futures balances (USDT)
                          - Open futures positions
                          - Futures trade / order history
                          - Realized PnL from futures trades

                        Not supported in v1:
                          - Binance Spot accounts
                          - Binance Coin-Margined Futures (COIN-M)
                          - Binance Options
                          - Any other exchange
                          - Mixed Spot + Futures aggregation

                        All plan references to "Binance" mean
                        "Binance USDT-M Futures" unless otherwise stated.

  Billing model:        20% of realized PnL on consented accounts.
                        CLOSED BETA / early-user model only.
                        NOT a public pricing model for open launch.
                        See Part 0-B for full monetization approach.

  Billing basis:        Realized PnL only (from futures trades).
                        Unrealized PnL is excluded.
                        Each calendar month is independent — no HWM.

  Billing rate:         20% of total_realized_pnl when positive.
                        Zero fee in loss months.

  Billing consent:      User must explicitly consent per exchange account
                        (billing_consent = true) before any fee applies.
                        Consent checkbox is mandatory in the connect modal.
                        See Section 9 for exact consent UI spec.

  Billing UI wording:   "Estimated monthly fee" / "Billing summary"
                        NEVER "Performance fee" / "Invoice" / "Amount due"
                        until payment collection + legal terms are live.

  Market intelligence:  Economic calendar / macro events ONLY.
                        There is NO news feed in v1.
                        Label it "Economic Calendar" — never "news updates".

  AI assistant:         Read-only. Portfolio + events data only.
                        No trade execution. No invented market data.
                        No external browsing.

  Auth model:           Refresh token → httpOnly cookie only.
                        Access token → Zustand store + localStorage.
                        Next.js middleware does NOT enforce auth via cookies.
                        Route protection is client-side only in v1
                        (inside (app)/layout.tsx using auth store + refresh).
                        See Section 4-A for full auth model spec.

  Sync reliability:     exchange_sync_runs table is required before deploy.
                        Staleness thresholds: balances 15m, positions 10m,
                        trades 30m, events 60m. Never show stale data silently.

════════════════════════════════════════════════════════════
PART 0-B — MONETIZATION APPROACH (honest framing)
════════════════════════════════════════════════════════════

The 20% profit-share model has a trust problem at v1 maturity.

The problem in plain terms:

  In v1, AlgoFin is not placing any trades.
  AlgoFin is not attributing which profits came from its tools.
  AlgoFin is not a verified strategy engine.
  A user can manually trade everything and still be billed if profitable.

  Consent solves the legal problem. It does not solve the trust problem.
  "Pay me 20% of your account profits to use my dashboard" is a
  hard sell unless the product is already delivering undeniable value.

Monetization approach for v1:

  ┌──────────────────────────────────────────────────────────┐
  │  CLOSED BETA (launch model)                              │
  │  20% profit-share with full explicit consent             │
  │  for a small, invited, private user group only           │
  │  Purpose: validate product + trust, not generate revenue │
  └──────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────┐
  │  PUBLIC v1 (post-beta option to consider)                │
  │  Option A: flat monthly fee for dashboard + assistant    │
  │  Option B: free tier (dashboard) + paid tier (assistant) │
  │  Option C: keep profit-share but only for strategy layer │
  │            when execution exists and attribution is real  │
  └──────────────────────────────────────────────────────────┘

The profit-share model becomes genuinely strong when:
  - AlgoFin is placing or signaling trades (v2 strategy layer)
  - There is real attribution between platform actions and profit
  - Users have verified the platform's value through a free period first

Build rule:
  The billing engine must exist in v1 to track and display estimated fees.
  But the 20% profit-share should only be enforced with consenting beta users.
  Do not make the 20% model the public default until there is stronger
  platform value justification.

════════════════════════════════════════════════════════════
PART 0-C — MVP SCOPE DISCIPLINE (two layers)
════════════════════════════════════════════════════════════

The v1 feature set is split into two explicit layers.
Build MVP-Core completely before touching MVP-Plus.

  MVP-Core (build this, nothing else first)
  ──────────────────────────────────────────
  [ ] Auth (signup, login, refresh tokens)
  [ ] Exchange connection (Binance USDT-M Futures, API key + secret)
  [ ] Sync engine (balances, positions, trades — with sync run ledger)
  [ ] Dashboard (account state, PnL, open positions, recent trades)
  [ ] Events page (economic calendar, high-impact filter, week view)
  [ ] AI assistant (portfolio + events context, 6 tools, no trade exec)
  [ ] Billing estimate page (realized PnL, estimated 20% fee summary)

  MVP-Plus (build after core loop is stable and tested)
  ──────────────────────────────────────────────────────
  [ ] Admin panel (user list, sync status, billing overview)
  [ ] Session management / login activity view
  [ ] Notification toggle settings
  [ ] Billing history UX polish
  [ ] Audit tooling / system log access
  [ ] TradingView chart embed page

  NOT IN V1 (never let these creep in)
  ──────────────────────────────────────
  ✗  Strategy execution engine
  ✗  Order placement or modification
  ✗  Backtesting lab
  ✗  Complex admin dispute workflows
  ✗  Live news feed / sentiment scoring
  ✗  Mobile app
  ✗  Multiple exchange support
  ✗  Copy trading
  ✗  2FA (plan for it, defer it)

════════════════════════════════════════════════════════════

AlgoFin — Full Implementation Plan
v1 = exchange-connected trading dashboard with event-aware AI assistant

════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────
1) Product Architecture — what you are actually building
────────────────────────────────────────────────────────────

AlgoFin is a SaaS platform with 5 real layers in v1:

  Layer A — Frontend Web App
    landing page
    auth (login/signup)
    dashboard
    exchange connection UI (with consent checkbox)
    economic calendar page
    AI assistant chat page
    billing estimate page
    settings/profile page
    (MVP-Plus: admin panel, session management)

  Layer B — Backend API (FastAPI)
    auth + user management
    exchange account management
    portfolio aggregation
    sync engine orchestration
    economic calendar ingestion (no news feed in v1)
    AI assistant orchestration
    billing calculation
    (MVP-Plus: admin, notifications)

  Layer C — Data & Storage
    PostgreSQL — main relational DB
    Redis — cache, sessions, rate limiting, job queues
    Encrypted credentials storage (backend-only)

  Layer D — Exchange Integration Layer
    Binance USDT-M Futures API
    Balance, position, trade sync
    Sync run ledger (exchange_sync_runs)

  Layer E — External Data Layer
    Economic calendar ingestion (Forex Factory equivalent)
    No general news feed in v1

  Layer F — Future (not in v1, architecture leaves room)
    Strategy execution engine
    Signal system
    Backtesting
    Multi-exchange support

────────────────────────────────────────────────────────────
2) Tech Stack
────────────────────────────────────────────────────────────

Frontend
  Next.js (React framework)
  TypeScript
  Tailwind CSS
  shadcn/ui component system
  TanStack Query for API state
  Zustand for minimal client state

Backend
  FastAPI (Python)
  Pydantic for request/response validation
  SQLAlchemy / SQLModel for ORM
  Celery + Redis for background workers

Database / Storage
  PostgreSQL — main relational DB
  Redis — cache, sessions, job queue
  Encrypted API key storage (Fernet / AES-256 at rest)

Auth
  JWT access token + refresh token rotation
  Email/password for v1
  Role system: user | admin
  2FA: planned, deferred to v1.5

Infrastructure
  Docker (all services containerized)
  GitHub + CI/CD
  Nginx reverse proxy
  HTTPS / SSL
  VPS or cloud deployment

────────────────────────────────────────────────────────────
3) Database Schema (v1 core tables)
────────────────────────────────────────────────────────────

Build ONLY these tables for MVP-Core. Deferred tables are listed
separately and must not be built until core loop is complete.

V1 CORE TABLES
──────────────

User & auth
  users
  refresh_tokens             ← required for token rotation
  login_activity             ← security visibility

Exchange / account
  user_exchange_accounts     ← Binance USDT-M Futures only in v1
  encrypted_api_credentials  ← encrypted at rest, backend-only decrypt
  exchange_billing_consents  ← audit trail of consent grants/revokes
  exchange_sync_runs         ← required before first deploy

Trading / account data
  balances
  positions
  trades

Economic events
  economic_events            ← calendar data only; no news_items in v1

AI assistant (minimal)
  chat_threads               ← one active thread per user, no sidebar
  chat_messages

Billing
  user_profit_periods        ← consented accounts only; no HWM
  billing_period_records     ← per-account per-period contribution rows

DEFERRED TABLES (v1.5+, do not build yet)
──────────────────────────────────────────
  user_profiles              ← extend users table instead in v1
  sessions                   ← JWT + refresh_tokens is sufficient
  2fa_settings               ← defer until auth is stable
  orders                     ← positions + trades cover v1 needs
  pnl_snapshots              ← defer; billing uses trades
  portfolio_snapshots        ← v1.5 balance history chart
  news_items                 ← only if reliable source confirmed
  assistant_actions          ← tool calls logged externally
  assistant_context_cache    ← not needed for 1-thread v1
  invoices                   ← no payment collection in v1
  payment_records            ← no payment collection in v1
  disputes                   ← no dispute UI in v1
  audit_logs                 ← full audit layer is v1.5
  system_logs                ← use application logging instead
  admin_notes                ← v1.5 admin tooling
  support_tickets            ← v1.5

  NOTE: "performance_fee_records" is a retired name.
  The correct v1 name is billing_period_records.
  Never use performance_fee_records anywhere in code or schema.

SCHEMA DETAILS (key tables)
────────────────────────────

--- user_exchange_accounts ---

  billing_consent     BOOLEAN NOT NULL DEFAULT false
    -- user must set true before this account is included in billing
  billing_consent_at  TIMESTAMPTZ
  sync_status         VARCHAR(20) NOT NULL DEFAULT 'pending'
    -- pending | connected | syncing | error | stale
  last_sync_at        TIMESTAMPTZ

--- exchange_sync_runs (required before deploy) ---

  CREATE TABLE exchange_sync_runs (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exchange_account_id UUID NOT NULL REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
      sync_type           VARCHAR(30) NOT NULL,
          -- balances | positions | trades | full
      status              VARCHAR(20) NOT NULL,
          -- running | success | error | partial
      started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at         TIMESTAMPTZ,
      rows_processed      INTEGER DEFAULT 0,
      error_message       TEXT,
      error_code          VARCHAR(50),
      triggered_by        VARCHAR(30) DEFAULT 'scheduler'
          -- scheduler | manual | webhook
  );

--- user_profit_periods ---

  CREATE TABLE user_profit_periods (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_start            DATE NOT NULL,
      period_end              DATE NOT NULL,
      total_realized_pnl      NUMERIC(20, 8) NOT NULL DEFAULT 0,
          -- net realized PnL across all consented accounts for the period
      performance_fee_rate    NUMERIC(5, 4) NOT NULL DEFAULT 0.20,
      performance_fee_amount  NUMERIC(20, 8) NOT NULL DEFAULT 0,
          -- max(0, total_realized_pnl) * performance_fee_rate
      status                  VARCHAR(20) NOT NULL DEFAULT 'open',
          -- open | estimated | acknowledged | paid | waived | incomplete
      notes                   TEXT,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, period_start)
  );

  No opening_balance, closing_balance, or high_water_mark columns.
  No accounts_included array — query exchange_billing_consents instead.
  No data_complete flag — derive from exchange_sync_runs if needed.

--- billing_period_records (per-account billing contribution rows) ---

  Purpose:
    Stores the realized PnL contribution of each individual consented
    exchange account for a given billing period. Used to break down
    how a user's user_profit_periods total was constructed.
    These are audit rows — NOT invoices, NOT payment demands.

  CREATE TABLE billing_period_records (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      profit_period_id      UUID NOT NULL REFERENCES user_profit_periods(id) ON DELETE CASCADE,
      exchange_account_id   UUID NOT NULL REFERENCES user_exchange_accounts(id),
      user_id               UUID NOT NULL REFERENCES users(id),
      period_start          DATE NOT NULL,
      period_end            DATE NOT NULL,
      account_realized_pnl  NUMERIC(20, 8) NOT NULL DEFAULT 0,
          -- sum of qualifying realized PnL for this account in this period
          -- see "Billing PnL Definition" in Section 5-A for inclusion rules
      data_complete         BOOLEAN NOT NULL DEFAULT false,
          -- false if any sync run for this account failed during the period
          -- period is not finalized if any contributing record has data_complete=false
      notes                 TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(profit_period_id, exchange_account_id)
  );

  Relationship to user_profit_periods:
    user_profit_periods.total_realized_pnl =
      SUM(billing_period_records.account_realized_pnl)
      WHERE profit_period_id = <period_id>
    Always derive the total from the records — never store it independently.

  No fee_amount column on billing_period_records.
    The fee is computed at the user_profit_periods level on the aggregate.
    Per-account records store only the PnL contribution, not a per-account fee.

--- exchange_billing_consents (append-only consent audit trail) ---

  Dual-record rule (must be implemented and understood by all developers):
    user_exchange_accounts.billing_consent      = current active consent state (boolean)
    user_exchange_accounts.billing_consent_at   = timestamp of most recent consent change
    exchange_billing_consents                   = append-only audit trail of every
                                                  consent grant, revocation, or version change

  The source of truth for whether an account is CURRENTLY consented is:
    user_exchange_accounts.billing_consent

  The source of truth for WHEN and HOW consent was granted/revoked is:
    exchange_billing_consents (query all rows for the account, ordered by consented_at)

  Never query exchange_billing_consents for the current consent state.
  Never trust user_exchange_accounts.billing_consent as the audit trail.
  Both records must be updated atomically on any consent change.

  CREATE TABLE exchange_billing_consents (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id               UUID NOT NULL REFERENCES users(id),
      exchange_account_id   UUID NOT NULL REFERENCES user_exchange_accounts(id),
      consent_granted       BOOLEAN NOT NULL,
          -- true = consent granted, false = consent revoked
      consent_version       VARCHAR(20) NOT NULL DEFAULT 'v1.0',
          -- version of the consent text shown to the user
      consented_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_address            INET,
      user_agent            TEXT
  );

────────────────────────────────────────────────────────────
4) Security Architecture (not optional)
────────────────────────────────────────────────────────────

AlgoFin handles real exchange API keys and real financial data.
Security is not a "nice-to-have." These are v1 requirements.

API key handling
  Never store exchange API keys in plain text
  Encrypt at rest (AES-256 / Fernet)
  Only backend decrypts credentials for sync jobs
  Frontend never sees raw API keys

User auth security
  Hashed passwords (bcrypt)
  Refresh token rotation (invalidate old on use)
  Login activity tracking (login_activity table)
  Rate limiting on auth endpoints

Backend security
  Request validation (Pydantic)
  Rate limiting on all API endpoints
  RBAC for admin endpoints
  Sensitive actions must be logged:
    - exchange connect / revoke
    - billing consent grant / revoke
    - admin manual fee override
    - export PnL data

────────────────────────────────────────────────────────────
4-A) Auth Model (locked — do not split across two approaches)
────────────────────────────────────────────────────────────

The v1 auth model is:

  Token storage:
    Refresh token  → httpOnly cookie (set by backend on login/refresh)
    Access token   → Zustand store + localStorage (set by frontend on
                     login response / refresh response)

  API calls:
    All authenticated API requests send the access token via
    Authorization: Bearer <access_token> header.
    The frontend reads the access token from Zustand/localStorage.
    src/lib/api.ts injects it into axios request headers.

  Route protection:
    Next.js middleware (middleware.ts) does NOT enforce auth.
    Do not read any token from cookies in middleware.ts.
    Route protection is implemented client-side only:
      - (app)/layout.tsx reads auth store on mount
      - If no valid access token, attempts refresh via httpOnly cookie
      - If refresh fails, redirects to /login
    This avoids the middleware-cookie mismatch where middleware.ts
    tries to read a cookie that the login flow never sets.

  Why this approach:
    Next.js middleware runs on the edge and cannot read Zustand state.
    The login flow stores the access token in Zustand/localStorage,
    not in a cookie. Middleware cannot see it. Enforcing auth in
    middleware.ts against a non-existent cookie silently passes all
    requests as unauthenticated. Client-side guard in layout.tsx
    is simpler, correct, and sufficient for v1.

  Alternative (not used in v1):
    Also write the access token to a non-httpOnly cookie so middleware
    can read it. This adds complexity and is not needed for v1.
    Do not implement this unless middleware-based protection is
    explicitly required (e.g. for SSR-heavy pages).

  Auth store (Zustand):
    accessToken: string | null
    user: User | null
    isAuthenticated: boolean
    login(tokens) — stores access token, sets isAuthenticated
    logout() — clears store, calls /auth/logout (backend clears cookie)
    refresh() — calls /auth/refresh, backend reads httpOnly cookie,
                returns new access token, store updates

────────────────────────────────────────────────────────────
5) Billing / Profit-Share System
────────────────────────────────────────────────────────────

Billing logic (locked — do not change):

  Profit basis:         Realized PnL only. Unrealized PnL is NOT included.
  Loss months:          No fee. Period status = open, fee = 0.
  High-water mark:      NONE. No HWM column exists anywhere in the schema.
                        Each calendar month is calculated independently.
  Eligible accounts:    Consented accounts only (billing_consent = true).
  Disconnect mid-month: Billing calculated up to last successful sync date.
  Sync data gap:        Period status set to 'incomplete'; fee paused.
  Manual trades:        All trades on consented accounts are included,
                        regardless of whether AlgoFin placed them.
                        This must be disclosed in the consent UI.

────────────────────────────────────────────────────────────
5-A) Billing PnL Definition (locked accounting policy — v1)
────────────────────────────────────────────────────────────

This is the authoritative accounting policy for what counts as
billable realized PnL. Every developer, billing function, and
review must apply these rules exactly. "Validate against Binance UI"
is a test, not a policy. This section is the policy.

Billing PnL definition v1
──────────────────────────

total_realized_pnl for a billing period is the SUM of realized PnL
from Binance USDT-M Futures trade history for all consented accounts,
computed as:

  INCLUDE:
    ✓  Realized PnL from fully or partially closing a futures position
       (position reductions / close orders)
    ✓  Realized PnL from any closing direction (long close, short close)
    ✓  Multiple fills on the same order — aggregate to order-level before summing
    ✓  Partial closes — each partial close contributes its realized PnL
       independently; they are summed within the period

  EXCLUDE (hard rules, never include these in v1):
    ✗  Unrealized PnL from open positions (excluded at all times)
    ✗  Funding payments (positive or negative) — treat as separate
       operational cost, not trade PnL; excluded from billing basis in v1
    ✗  Trading fees — do NOT deduct fees from realized PnL for billing;
       Binance reports realized PnL after fees in its own P&L view;
       use whatever the API returns as the realized PnL field directly
    ✗  Deposits, withdrawals, and inter-account transfers
    ✗  Referral rebates, commission credits, and bonus credits
    ✗  Manual balance adjustments, insurance fund payouts
    ✗  Liquidation adjustments beyond the realized loss on the position
    ✗  Any row where realized PnL cannot be confidently mapped to
       a specific futures trade close in the history

  DATA SOURCE RULES:
    Source:  Binance USDT-M Futures /fapi/v1/userTrades or equivalent
             via CCXT fetchMyTrades for USDTM futures markets
    Level:   Fill-level data from API → aggregate to order-level → sum to period
    Field:   Use the "realizedPnl" field (or CCXT equivalent) from the trade
             history response. Do not invent or derive from position snapshots.
    Mismatch: If CCXT and Binance direct API return different values for
              realizedPnl, log the discrepancy and use Binance direct API
              as the ground truth. Never silently pick one over the other.

  INCOMPLETE DATA RULES:
    If any sync run for a consented account fails or returns partial data
    during the billing period:
      → Set billing_period_records.data_complete = false for that account
      → Set user_profit_periods.status = 'incomplete'
      → Do NOT finalize or display a fee for the period
      → Display: "Fee calculation incomplete — sync data missing"
    Do not estimate or interpolate missing sync data.

  VERIFICATION GATE (before Phase F):
    Before wiring billing to real trade data, manually verify:
    [ ] Sum of realizedPnl from API matches Binance UI "Realized PnL" for
        the same date range (tolerance: < $0.01 rounding difference)
    [ ] Partial close reporting: two partial closes on one position sum
        correctly to the total realized PnL shown in Binance UI
    [ ] Multiple fills on one order are aggregated, not double-counted
    [ ] Funding payments are NOT included in the sum (verify field separately)
    [ ] A zero-trade month returns total_realized_pnl = 0, fee = 0
    If any check fails, billing must not go live on real accounts.

  WHY FEES ARE NOT DEDUCTED:
    Binance Futures realized PnL as shown in their UI is net of trading fees.
    The API realizedPnl field reflects this. We use the API value directly
    to match what the user sees in Binance. Do not double-subtract fees.

  Field names (locked — use these everywhere, no aliases):
    total_realized_pnl      (not net_realized_pnl)
    performance_fee_rate    (default 0.20)
    performance_fee_amount  (not estimated_fee_amount)
    status                  open | estimated | acknowledged | paid | waived | incomplete

Single source of truth for PnL:

  One shared backend function only:

    calculate_period_pnl(user_id, period_start, period_end)
      → total_realized_pnl
      → performance_fee_rate
      → performance_fee_amount
      → consented_account_ids   (queried from exchange_billing_consents)
      → is_complete             (derived from exchange_sync_runs)

  Dashboard endpoint calls it.
  Billing endpoint calls it.
  Assistant tool calls it (or reads cached output).

  Never duplicate this logic. Three places computing PnL differently
  will produce mismatches and user-visible contradictions.
  Field names in this function must match the schema exactly.

UI wording rules (hard):

  CORRECT for v1:
    "Estimated monthly fee"
    "AlgoFin billing estimate"
    "Current billing summary"
    "Projected fee for this period"

  NEVER in v1 UI:
    "Performance fee" (implies formal billing contract)
    "Invoice" (implies collectible document with legal standing)
    "Amount due" (implies a payment is being demanded now)

────────────────────────────────────────────────────────────
6) AI Assistant (scope hard-bounded)
────────────────────────────────────────────────────────────

The assistant is NOT the core product. It is a read-only intelligence
layer on top of real account + events data. It is only useful because
the underlying data infrastructure is solid.

V1 assistant — locked scope:

  CAN answer:
    "What is my current portfolio value?"
    "What positions are currently open?"
    "Show my recent trades."
    "What was my realized PnL this month?"
    "What is my estimated AlgoFin fee this month?"
    "What high-impact events are coming up today or this week?"
    "Summarize today's macro events."

  CANNOT in v1:
    Place, modify, or cancel any trade or order
    Give specific entry/exit recommendations
    Invent or estimate data not from platform databases
    Browse external sources / web
    Answer questions about external portfolios, taxes, or legal advice

V1 UX constraints (hard limits):

  One active thread per user. No thread list, no thread sidebar.
  No thread management UI of any kind in v1.
  Plain chat page: input + response + message history. Nothing more.
  chat_threads: one row per user, reused across sessions.
  No assistant_context_cache. No assistant_actions table.

Assistant tool layer (6 tools, no more):

  get_portfolio_summary()
  get_open_positions()
  get_recent_trades(limit)
  get_monthly_pnl(period)
  get_estimated_fee(period)
  get_upcoming_events(impact_level, days_ahead)

  Tools must return structured, deterministic summaries — not raw DB rows.
  Never pass more data than needed to answer the question.
  Log every tool call: input, output, latency, timestamp.
  All assistant responses must cite data source and freshness.
    (e.g. "Based on your Binance Futures account as of 3 min ago.")

  If intent cannot be resolved:
    "I don't have that information available right now.
     Please check your dashboard."

────────────────────────────────────────────────────────────
7) Economic Events Module
────────────────────────────────────────────────────────────

V1 market intelligence is an economic events system.
It is NOT a news feed. These are different things.

What v1 ships:
  Economic calendar (upcoming macro events with date/time/impact)
  High-impact event filtering (red/orange flag equivalent)
  Event fields: title, currency/country, impact level, date/time,
    forecast, previous, actual (when available), source
  Event-aware assistant summaries

What v1 does NOT ship:
  General financial news feed
  Live crypto news scraping
  Sentiment scoring
  News-to-position correlation

UI labels that are correct:
  "Economic Calendar"
  "Upcoming High-Impact Events"
  "Market Events"

UI labels that are wrong:
  "Live Market Intelligence"
  "AI-Powered News Feed"
  "Forex Factory-style updates" (do not brand it this way)

────────────────────────────────────────────────────────────
8) Data Staleness Model
────────────────────────────────────────────────────────────

The UI must display staleness state. Never silently show old data.

Staleness thresholds:
  Balances:  stale if last_sync_at > 15 minutes ago
  Positions: stale if last_sync_at > 10 minutes ago
  Trades:    stale if last_sync_at > 30 minutes ago
  Events:    stale if last_fetched_at > 60 minutes ago

Dashboard display rules:
  If any data source is stale: show "Synced X min ago" + warning icon
  If sync status = error: show "Exchange attention required" (red badge)
  If sync status = stale: show "Positions may be outdated" inline
  Never silently show stale data as current

Frontend staleness component must:
  Read freshness timestamps from dashboard summary API
  Show per-section freshness (balances, positions, trades are separate)
  Auto-refresh every 60 seconds
  Show a manual refresh button (triggers on-demand sync)

Dashboard API response must include data_freshness:

  {
    "data_freshness": {
      "balances":  { "synced_at": "...", "is_stale": false },
      "positions": { "synced_at": "...", "is_stale": false },
      "trades":    { "synced_at": "...", "is_stale": false }
    }
  }

────────────────────────────────────────────────────────────
9) API Contracts (final v1 endpoints)
────────────────────────────────────────────────────────────

Endpoint groups:

  /auth        — signup, login, logout, refresh, password reset
  /users       — profile, settings
  /exchanges   — connect, list, revoke, sync trigger
  /portfolio   — summary (with data_freshness)
  /positions   — open positions list
  /trades      — recent trades list
  /events      — economic calendar (filter by impact, currency, date)
  /assistant   — chat message send/receive
  /billing     — current period, period history
  (MVP-Plus: /admin — user list, sync status, billing overview)

--- POST /exchanges/connect ---

  BILLING MODE FOR V1: SHADOW BILLING (Mode B — estimate only)
  ─────────────────────────────────────────────────────────────
  AlgoFin v1 operates in shadow billing mode during closed beta.
  Fees are calculated and displayed for transparency and beta validation.
  No fee is collected or invoiced. Consent is required for the estimate
  to be shown — it is NOT a binding payment contract in v1.

  If billing mode changes to real collection (Mode A), the consent text,
  legal terms, and this section must all be updated before shipping.
  Do not collect payment under the current consent text.

Request:
{
  "exchange_id":    "binance_usdtm",
  "label":          "My Binance Futures",
  "api_key":        "xxx",
  "api_secret":     "yyy",
  "passphrase":     null,
  "billing_consent": {
    "consented":        true,
    "consent_version":  "v1.0",
    "consent_text":     "AlgoFin calculates and displays an estimated performance fee of 20% of my monthly realized profit from this Binance Futures account for beta evaluation purposes. This is not a charge. All manual trades on this account are included regardless of whether AlgoFin placed them."
  }
}

  billing_consent object is required.
  If consented is false or object is missing, request is rejected.
  Backend writes a row to exchange_billing_consents on every change.
  Backend also updates user_exchange_accounts.billing_consent and
    billing_consent_at atomically in the same transaction.
  consent_version allows future consent text changes to be tracked.

  Frontend connect modal MUST include (in this order):
    1. Exchange selector (binance_usdtm only in v1)
    2. Label input
    3. API key input
    4. API secret input
    5. Passphrase input (optional, shown greyed if not required)
    6. Security notice ("Keys are encrypted at rest and never shown again")
    7. Billing consent checkbox (REQUIRED — unchecked by default)
       Exact text: "AlgoFin calculates and displays an estimated
       performance fee of 20% of my monthly realized profit from this
       Binance Futures account for beta evaluation purposes.
       This is not a charge. All manual trades on this account are
       included regardless of whether AlgoFin placed them."
    8. Connect button — DISABLED until checkbox is checked

  The connect button must remain disabled until the consent checkbox
  is explicitly checked. This is not optional.

--- GET /billing/periods/current ---

Response:
{
  "success": true,
  "data": {
    "id":                     "<uuid>",
    "period_start":           "2026-07-01",
    "period_end":             "2026-07-31",
    "total_realized_pnl":     920.00,
    "performance_fee_rate":   0.20,
    "performance_fee_amount": 184.00,
    "status":                 "estimated",
    "notes":                  null
  }
}

  Field names match schema exactly:
    total_realized_pnl      (not net_realized_pnl)
    performance_fee_rate    (not estimated_fee_rate)
    performance_fee_amount  (not estimated_fee_amount)
  No high_water_mark field anywhere.
  No data_complete field (derive from sync runs if needed separately).
  No accounts_included array (query exchange_billing_consents separately).
  Frontend labels this as "Estimated monthly fee" — never "Invoice".

--- GET /portfolio/summary ---

Response must include data_freshness:
{
  "success": true,
  "data": {
    "total_value_usdt":  12430.50,
    "open_positions":    3,
    "realized_pnl_mtd": 920.00,
    "connected_accounts": 1,
    "data_freshness": {
      "balances":  { "synced_at": "2026-07-09T08:50:00Z", "is_stale": false },
      "positions": { "synced_at": "2026-07-09T08:52:00Z", "is_stale": false },
      "trades":    { "synced_at": "2026-07-09T08:45:00Z", "is_stale": false }
    }
  }
}

────────────────────────────────────────────────────────────
10) TypeScript Types (frontend, final v1)
────────────────────────────────────────────────────────────

// src/types/billing.ts

export type PeriodStatus =
  | 'open'
  | 'estimated'
  | 'acknowledged'
  | 'paid'
  | 'waived'
  | 'incomplete';

export type ProfitPeriod = {
  id:                     string;
  period_start:           string;   // ISO date "2026-07-01"
  period_end:             string;
  total_realized_pnl:     number;   // matches schema column name exactly
  performance_fee_rate:   number;   // 0.20
  performance_fee_amount: number;   // max(0, total_realized_pnl) * rate
  status:                 PeriodStatus;
  notes:                  string | null;
};

  Field names match the schema and API response exactly.
  No high_water_mark field — does not exist in schema.
  No net_realized_pnl — use total_realized_pnl.
  No estimated_fee_amount — use performance_fee_amount.
  No estimated_fee_rate — use performance_fee_rate.
  No data_complete — derive from sync runs separately if needed.
  No accounts_included — query exchange_billing_consents separately.

export type BillingConsentPayload = {
  consented:       boolean;
  consent_version: string;  // "v1.0"
  consent_text:    string;  // exact consent text shown to user
};

// src/types/exchange.ts

export type SyncStatus = 'pending' | 'connected' | 'syncing' | 'error' | 'stale';

export type ExchangeAccount = {
  id:               string;
  label:            string;
  exchange_id:      string;   // "binance_usdtm"
  sync_status:      SyncStatus;
  billing_consent:  boolean;
  last_sync_at:     string | null;
};

// src/types/dashboard.ts

export type DataFreshnessItem = {
  synced_at: string | null;
  is_stale:  boolean;
};

export type PortfolioSummary = {
  total_value_usdt:    number;
  open_positions:      number;
  realized_pnl_mtd:   number;
  connected_accounts:  number;
  data_freshness: {
    balances:  DataFreshnessItem;
    positions: DataFreshnessItem;
    trades:    DataFreshnessItem;
  };
};

────────────────────────────────────────────────────────────
11) Build Sequencing (correct order — do not deviate)
────────────────────────────────────────────────────────────

Phase A — Foundation (before any code)
  PRD + feature scope locked (this plan)
  DB schema finalized
  Backend module structure planned
  Frontend wireframes (not design, just flows)

Phase B — Core Backend
  Project setup (FastAPI, PostgreSQL, Redis, Docker)
  Auth system (signup, login, refresh tokens, roles)
  Exchange connection + encrypted credential storage
  Sync engine: balances, positions, trades
  exchange_sync_runs ledger (required before first sync)
  Staleness model working in API responses

Phase C — Core Data Verification (before any UI)
  Validate Binance USDT-M PnL data quality (see Risk 1)
  Confirm calculate_period_pnl() returns correct real data
  Confirm data_freshness returned correctly from /portfolio/summary
  All sync jobs running and writing exchange_sync_runs rows

  ← Only after Phase C is verified: build any UI

Phase D — MVP-Core Frontend
  Dashboard (portfolio summary, positions, trades, PnL, staleness)
  Exchange connection flow
  Events/calendar page
  AI assistant chat page
  Billing estimate page

Phase E — Intelligence Layer
  AI assistant connected to all 6 internal tools
  Economic calendar ingestion + events page
  Dashboard event widgets (next high-impact event, today's events)

Phase F — Billing System
  calculate_period_pnl() function
  Monthly profit period engine
  Billing summary page (estimated fee, period status)
  Consent flow for beta users

Phase G — MVP-Plus (after core loop is stable)
  Admin panel (user list, sync status, billing overview)
  Session management / login activity view
  Notification toggles
  TradingView chart embed
  Billing history UX polish

Phase H — Hardening
  Security audit (auth bypass, rate limits, API key exposure)
  Error state coverage (failed sync, stale data, empty states)
  Edge case testing (zero positions, loss month, no consent, data gap)
  Staging deployment + smoke tests

Phase I — Production
  Production deployment
  Monitoring (uptime, failed sync alerts, job failures)
  Closed beta user onboarding

Phase J — Future (v2+, after v1 is stable)
  Strategy execution engine
  Order placement
  Backtesting lab
  Multi-exchange support
  Strategy marketplace

────────────────────────────────────────────────────────────
12) Folder / Module Structure
────────────────────────────────────────────────────────────

Frontend (Next.js)
  /auth
  /dashboard
  /exchanges
  /events
  /assistant
  /billing
  /settings
  (MVP-Plus: /admin)

Backend (FastAPI)
  app/auth/
  app/users/
  app/exchanges/
  app/portfolio/
  app/trades/
  app/events/
  app/assistant/
  app/billing/
  app/common/
  workers/

────────────────────────────────────────────────────────────
13) Landing Page Copy Rules
────────────────────────────────────────────────────────────

The landing page must NOT misrepresent what v1 actually does.

Hero headline options (accurate):
  "Your Binance Futures dashboard, upgraded."
  "One place for your trades, events, and portfolio."
  "Portfolio-aware trading intelligence."

Hero subtext (accurate v1 framing):
  "Connect your Binance Futures account, track your portfolio in real time,
   stay ahead of high-impact macro events, and ask your AI assistant anything
   about your own positions — all in one dashboard."

Pricing section:
  DO:
    "We take 20% of your profitable months only."
    "Zero fee in losing months."
    "Estimated at end of each calendar month."
    "No payment collected yet — this is a closed beta."
  DON'T:
    "Performance Fee: 20%" as a heading
    "Invoice generated monthly"
    "Full algorithmic trading automation" (not in v1)
    "Live news intelligence" (not in v1)
    "Proven trading strategies" (not in v1)

Stat bar examples (pick any):
  "20% only on profitable months"
  "Binance Futures connected"
  "AI portfolio insights"
  "Real-time economic events"

────────────────────────────────────────────────────────────
14) Execution Risks — What Still Fails During Build
────────────────────────────────────────────────────────────

The architecture is correct. The remaining risk is execution discipline.

RISK 1 — Binance realized PnL data quality

  Before wiring billing to trade data, validate ALL of the following
  with real API responses (not docs, not assumed shapes):

  [ ] What field does the endpoint actually return for realized PnL?
  [ ] Does partial close of a position report correct partial PnL?
  [ ] Are multiple fills on one order aggregated or split?
  [ ] Are trading fees already deducted, or do you subtract them?
  [ ] Is funding rate PnL included or separate?
  [ ] Does the value match what Binance shows in their own UI?

  If your normalized realized_pnl does not match Binance's own P&L
  calculation, you cannot bill on it. Do this before Phase F.

RISK 2 — Assistant tool layer quality

  The model will produce wrong answers if the tool layer is poorly built.

  [ ] Tools return structured, deterministic summaries — not raw DB rows
  [ ] Never pass more data than the model needs
  [ ] Log every tool call: input, output, latency, timestamp
  [ ] Test these real scenarios before shipping:
        - user has zero open positions
        - user has a negative PnL month (zero fee expected)
        - user has no consented account
        - data is stale (is_stale = true)
        - events list is empty

RISK 3 — PnL must come from one calculation layer

  Dashboard, billing page, and assistant must all use the same number.
  Three separate queries will drift and produce visible mismatches.

  One function only: calculate_period_pnl(user_id, period_start, period_end)
  Everything else reads its output. Never duplicate this logic.

RISK 4 — Frontend must not outrun the backend

  Do not build any page with real UI until:

  [ ] Exchange connection + credential storage working end-to-end
  [ ] Sync jobs run and exchange_sync_runs rows are being written
  [ ] Portfolio data (balances, positions, trades) stored and queryable
  [ ] calculate_period_pnl() returns correct results with real data
  [ ] data_freshness returned correctly from /portfolio/summary

  Violating this order means you ship a beautiful app with wrong numbers.
  Users on a trading platform will notice wrong numbers immediately.

RISK 5 — Product framing drift during build

  The biggest non-technical risk: building features that sound good
  but don't match the v1 product identity.

  The test: every feature decision should pass this question:
    "Does this help a trader monitor their Binance Futures account,
     understand event risk, or answer portfolio-specific questions?"

  If the answer is no — it is not v1 scope.

────────────────────────────────────────────────────────────
SUMMARY TABLE
────────────────────────────────────────────────────────────

  Area                       Build rule
  ─────────────────────────  ─────────────────────────────────────────
  Product identity           Exchange-connected dashboard + event-aware AI.
                             Not an algo execution platform.
  Monetization               20% profit-share for closed beta only.
                             Do not default-apply to all public users in v1.
  MVP scope                  MVP-Core first, MVP-Plus after, nothing else.
  Trader value argument      One dashboard: your account + events + AI.
  Binance PnL data quality   Validate all edge cases before billing
  Assistant tool layer       Structured, deterministic, logged, tested
  PnL calculation            One shared function — never duplicated
  Build order                Backend data reliability before any UI

════════════════════════════════════════════════════════════
PLAN STATUS: COMPLETE — DO NOT ADD MORE SECTIONS
Read order for implementation:
  1. Part 0   — Product identity (what AlgoFin v1 is)
  2. Part 0-A — Locked decisions (constraints)
  3. Part 0-B — Monetization approach (honest framing)
  4. Part 0-C — MVP scope discipline (two layers)
  5. Sections 1–9 — Architecture, schema, API, types
  6. Section 10  — TypeScript types
  7. Section 11  — Build sequencing
  8. Sections 12–14 — Structure, copy, execution risks
If any section contradicts Part 0 through Part 0-C, Part 0 wins.
════════════════════════════════════════════════════════════