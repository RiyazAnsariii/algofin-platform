// src/app/page.tsx
// AlgoFin v1 â€” Landing Page
// Copy rules per plan.md Section 13 â€” exact wording enforced.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AlgoFin â€” Your Binance Futures Dashboard, Upgraded",
  description:
    "Connect your Binance Futures account, track your portfolio in real time, stay ahead of high-impact macro events, and ask your AI assistant anything about your own positions â€” all in one dashboard.",
};

// â”€â”€â”€ Icon components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function HexLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path
        d="M18 3L31 10.5V25.5L18 33L5 25.5V10.5L18 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="text-primary"
      />
      <path
        d="M18 10L25 14.5V22.5L18 27L11 22.5V14.5L18 10Z"
        fill="currentColor"
        className="text-primary"
        opacity="0.8"
      />
      <path
        d="M18 15L22 17.5V21.5L18 24L14 21.5V17.5L18 15Z"
        fill="currentColor"
        className="text-primary"
      />
    </svg>
  );
}

// â”€â”€â”€ Stat bar item â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-full glass border border-white/8 text-sm whitespace-nowrap">
      <span className="font-semibold text-primary">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

// â”€â”€â”€ Feature card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FeatureCard({
  icon,
  title,
  description,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <div
      className="surface-card-hover p-6 space-y-4 gradient-border animate-fade-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div className="space-y-1.5">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// â”€â”€â”€ Pricing feature item â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PricingItem({ text, positive = true }: { text: string; positive?: boolean }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span className={`mt-0.5 text-base leading-none ${positive ? "pnl-positive" : "text-muted-foreground"}`}>
        {positive ? "âœ“" : "Â·"}
      </span>
      <span className={positive ? "text-foreground" : "text-muted-foreground"}>{text}</span>
    </li>
  );
}

// â”€â”€â”€ Nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 h-16 glass border-b border-white/6">
      <Link href="/" className="flex items-center gap-2.5 group">
        <div className="transition-all group-hover:glow-cyan-sm rounded-lg">
          <HexLogo size={28} />
        </div>
        <span className="font-semibold tracking-tight text-gradient-cyan text-lg">AlgoFin</span>
      </Link>
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="text-sm font-medium px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors glow-cyan-sm"
        >
          Get started
        </Link>
      </div>
    </nav>
  );
}

// â”€â”€â”€ Hero section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 px-6 md:px-12 overflow-hidden">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
      >
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full opacity-20"
          style={{
            background: "radial-gradient(ellipse, oklch(0.72 0.18 200) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute top-40 left-1/4 w-[400px] h-[300px] rounded-full opacity-10"
          style={{
            background: "radial-gradient(ellipse, oklch(0.7 0.18 155) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
      </div>

      {/* Grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        aria-hidden
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.72 0.18 200) 1px, transparent 1px), linear-gradient(90deg, oklch(0.72 0.18 200) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative max-w-4xl mx-auto text-center space-y-8">
        {/* Beta badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-primary/20 text-xs font-medium text-primary animate-fade-in">
          <span className="pulse-dot w-1.5 h-1.5" />
          Closed Beta â€” Binance USDT-M Futures
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] animate-fade-up">
          Your Binance Futures<br />
          <span className="text-gradient-cyan">dashboard, upgraded.</span>
        </h1>

        {/* Subtext â€” exact wording from plan.md Section 13 */}
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-fade-up delay-100">
          Connect your Binance Futures account, track your portfolio in real time,
          stay ahead of high-impact macro events, and ask your AI assistant anything
          about your own positions â€” all in one dashboard.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-up delay-200">
          <Link
            href="/signup"
            id="hero-cta-signup"
            className="group flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-cyan hover:glow-cyan"
          >
            Request beta access
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-0.5">
              <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <Link
            href="/login"
            id="hero-cta-login"
            className="px-6 py-3 rounded-xl glass border border-white/10 text-sm font-medium hover:border-white/20 hover:bg-white/5 transition-all"
          >
            Sign in to dashboard
          </Link>
        </div>

        {/* Stat bar â€” accurate v1 framing from plan.md Section 13 */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-4 animate-fade-up delay-300">
          <StatBadge value="20%" label="only on profitable months" />
          <StatBadge value="Binance Futures" label="connected" />
          <StatBadge value="AI" label="portfolio insights" />
          <StatBadge value="Real-time" label="economic events" />
        </div>
      </div>
    </section>
  );
}

// â”€â”€â”€ Dashboard preview mockup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DashboardPreview() {
  return (
    <section className="px-6 md:px-12 pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="glass-strong rounded-2xl border border-white/8 overflow-hidden shadow-2xl">
          {/* Fake browser bar */}
          <div className="flex items-center gap-2 px-4 h-9 bg-surface-1 border-b border-white/6">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
            </div>
            <div className="flex-1 mx-3">
              <div className="h-5 rounded-md bg-white/5 flex items-center px-3">
                <span className="text-[10px] text-muted-foreground/60">app.algofin.io/dashboard</span>
              </div>
            </div>
          </div>

          {/* Dashboard content mock */}
          <div className="flex h-[420px] md:h-[520px]">
            {/* Sidebar */}
            <div className="hidden md:flex w-48 flex-col border-r border-white/6 bg-surface-1 p-3 gap-1">
              {["Dashboard", "Exchanges", "Economic Calendar", "AI Assistant", "Billing", "Settings"].map((item, i) => (
                <div
                  key={item}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs ${
                    i === 0
                      ? "bg-primary/10 text-primary font-medium border border-primary/15"
                      : "text-muted-foreground"
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-primary" : "bg-white/10"}`} />
                  {item}
                </div>
              ))}
            </div>

            {/* Main content */}
            <div className="flex-1 p-6 space-y-5 overflow-hidden">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">Portfolio Overview</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <span className="pulse-dot w-1.5 h-1.5" />
                    Synced 2 min ago
                  </div>
                </div>
                <div className="badge-connected text-[10px]">
                  <span className="pulse-dot w-1.5 h-1.5" />
                  Connected
                </div>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Portfolio Value", value: "$12,430.50", sub: "USDT-M Futures", color: "text-foreground" },
                  { label: "Open Positions", value: "3", sub: "Active", color: "text-foreground" },
                  { label: "Realized PnL (MTD)", value: "+$920.00", sub: "This month", color: "pnl-positive" },
                  { label: "Est. Fee", value: "$184.00", sub: "20% of profit", color: "text-muted-foreground" },
                ].map((stat) => (
                  <div key={stat.label} className="surface-card p-3 space-y-1.5">
                    <div className="text-[10px] text-muted-foreground">{stat.label}</div>
                    <div className={`text-base font-semibold ${stat.color}`}>{stat.value}</div>
                    <div className="text-[10px] text-muted-foreground/60">{stat.sub}</div>
                  </div>
                ))}
              </div>

              {/* Positions list */}
              <div className="surface-card overflow-hidden">
                <div className="px-3 py-2 border-b border-white/6 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Open Positions
                </div>
                <div className="divide-y divide-white/4">
                  {[
                    { symbol: "BTCUSDT", side: "LONG", size: "0.05 BTC", pnl: "+$142.30", entry: "$61,200" },
                    { symbol: "ETHUSDT", side: "SHORT", size: "1.2 ETH", pnl: "-$28.50", entry: "$3,280" },
                    { symbol: "SOLUSDT", side: "LONG", size: "8 SOL", pnl: "+$67.80", entry: "$142.40" },
                  ].map((pos) => (
                    <div key={pos.symbol} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                          pos.side === "LONG"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400"
                        }`}>
                          {pos.side}
                        </div>
                        <span className="font-medium text-foreground">{pos.symbol}</span>
                        <span className="text-muted-foreground">{pos.size}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-muted-foreground">{pos.entry}</span>
                        <span className={pos.pnl.startsWith("+") ? "pnl-positive font-medium" : "pnl-negative font-medium"}>
                          {pos.pnl}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// â”€â”€â”€ Features section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FeaturesSection() {
  const features = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      ),
      title: "Real Binance Futures data",
      description:
        "Sync your actual Binance USDT-M Futures account â€” balances, open positions, trade history, and realized PnL. Not public price data. Your data.",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
          <circle cx="12" cy="15" r="1" fill="currentColor" />
          <circle cx="8" cy="15" r="1" fill="currentColor" />
          <circle cx="16" cy="15" r="1" fill="currentColor" />
        </svg>
      ),
      title: "Economic Calendar",
      description:
        "Track upcoming high-impact macro events that move the market â€” CPI, FOMC, NFP and more â€” before they hit your positions.",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
          <path d="M12 8v4l3 3" />
        </svg>
      ),
      title: "AI Assistant",
      description:
        "Ask your AI assistant about your own portfolio â€” positions, PnL, upcoming events. It knows your account, not generic market commentary.",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      ),
      title: "One dashboard",
      description:
        "Your account + events + AI â€” all in one place, not split across Binance + TradingView + Forex Factory + ChatGPT.",
    },
  ];

  return (
    <section className="px-6 md:px-12 pb-24">
      <div className="max-w-5xl mx-auto space-y-12">
        <div className="text-center space-y-3">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            One place for your{" "}
            <span className="text-gradient-brand">trading workflow</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base">
            AlgoFin combines four tools traders currently juggle separately â€” in one connected dashboard.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f, i) => (
            <FeatureCard key={f.title} {...f} delay={i * 80} />
          ))}
        </div>
      </div>
    </section>
  );
}

// â”€â”€â”€ Pricing section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PricingSection() {
  return (
    <section className="px-6 md:px-12 pb-24" id="pricing">
      <div className="max-w-5xl mx-auto">
        <div className="text-center space-y-3 mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Simple, honest{" "}
            <span className="text-gradient-cyan">pricing</span>
          </h2>
          <p className="text-muted-foreground text-sm md:text-base">
            We only earn when you do. Zero fee in losing months.
          </p>
        </div>

        <div className="max-w-md mx-auto gradient-border rounded-2xl p-px">
          <div className="bg-surface-1 rounded-2xl p-8 space-y-6">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-primary uppercase tracking-widest">
                Closed Beta
              </div>
              <div className="flex items-end gap-2 mt-2">
                <span className="text-5xl font-bold text-gradient-cyan">20%</span>
                <span className="text-muted-foreground mb-1.5 text-sm">of profitable months only</span>
              </div>
            </div>

            {/* Pricing items â€” exact wording from plan.md Section 13 */}
            <ul className="space-y-3">
              <PricingItem text="We take 20% of your profitable months only." />
              <PricingItem text="Zero fee in losing months." />
              <PricingItem text="Estimated at end of each calendar month." />
              <PricingItem text="No payment collected yet â€” this is a closed beta." />
              <PricingItem text="All manual trades included â€” AlgoFin doesn't need to place them." positive={false} />
            </ul>

            <div className="border-t border-white/8 pt-5 space-y-3">
              <Link
                href="/signup"
                id="pricing-cta"
                className="flex items-center justify-center w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-cyan-sm"
              >
                Request beta access
              </Link>
              <p className="text-xs text-muted-foreground text-center">
                Closed beta. Invite required. No payment collected during beta.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// â”€â”€â”€ CTA section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CtaSection() {
  return (
    <section className="px-6 md:px-12 pb-24">
      <div className="max-w-3xl mx-auto text-center space-y-6">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          The dashboard that{" "}
          <span className="text-gradient-cyan">knows your account.</span>
        </h2>
        <p className="text-muted-foreground">
          Real Binance Futures data Â· Economic events Â· AI portfolio assistant
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            id="cta-section-signup"
            className="group flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all glow-cyan"
          >
            Get started
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-0.5">
              <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <Link
            href="/login"
            id="cta-section-login"
            className="px-8 py-3.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Already have an account â†’
          </Link>
        </div>
      </div>
    </section>
  );
}

// â”€â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Footer() {
  return (
    <footer className="border-t border-white/6 px-6 md:px-12 py-8">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <HexLogo size={22} />
          <span className="text-sm font-semibold text-gradient-cyan">AlgoFin</span>
          <span className="text-xs text-muted-foreground ml-2">v1 Closed Beta</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <span>Binance USDT-M Futures only</span>
          <span>Â·</span>
          <span>Read-only dashboard</span>
          <span>Â·</span>
          <span>No trade execution</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Â© 2026 AlgoFin. Closed beta â€” not for public use.
        </p>
      </div>
    </footer>
  );
}

// â”€â”€â”€ Page export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function LandingPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <HeroSection />
        <DashboardPreview />
        <FeaturesSection />
        <PricingSection />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}

