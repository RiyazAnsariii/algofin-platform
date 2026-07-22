// src/app/page.tsx
// AlgoFin — Landing Page

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AlgoFin — Professional Trading Workspace",
  description:
    "Connect your trading account, monitor your portfolio in real time, stay ahead of market-moving events, and get AI-powered insights — all from one intelligent workspace.",
};

// ── Icon components ────────────────────────────────────────────────
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

// ── Feature pill ───────────────────────────────────────────────────
function FeaturePill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-full glass border border-white/10 text-sm whitespace-nowrap group hover:border-primary/30 hover:bg-primary/5 transition-all">
      <span className="text-primary">{icon}</span>
      <span className="text-foreground font-medium">{label}</span>
    </div>
  );
}

// ── Feature card ───────────────────────────────────────────────────
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
      className="surface-card-hover p-6 space-y-4 gradient-border animate-fade-up group"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:bg-primary/15 transition-colors">
        {icon}
      </div>
      <div className="space-y-1.5">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ── Pricing feature item ───────────────────────────────────────────
function PricingItem({ text, positive = true }: { text: string; positive?: boolean }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span className={`mt-0.5 text-base leading-none ${positive ? "pnl-positive" : "text-muted-foreground"}`}>
        {positive ? "✓" : "·"}
      </span>
      <span className={positive ? "text-foreground" : "text-muted-foreground"}>{text}</span>
    </li>
  );
}

// ── Nav ────────────────────────────────────────────────────────────
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

// ── Hero section ───────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 px-6 md:px-12 overflow-hidden">
      {/* Background radial glow layers */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {/* Primary top center glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full"
          style={{
            background: "radial-gradient(ellipse, oklch(0.72 0.18 200 / 22%) 0%, transparent 65%)",
            filter: "blur(80px)",
          }}
        />
        {/* Secondary teal tint */}
        <div
          className="absolute top-48 left-1/3 w-[500px] h-[400px] rounded-full"
          style={{
            background: "radial-gradient(ellipse, oklch(0.7 0.18 155 / 10%) 0%, transparent 70%)",
            filter: "blur(100px)",
          }}
        />
        {/* Subtle right accent */}
        <div
          className="absolute top-20 right-0 w-[350px] h-[350px] rounded-full"
          style={{
            background: "radial-gradient(ellipse, oklch(0.65 0.2 260 / 8%) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
      </div>

      {/* Fine grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        aria-hidden
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.72 0.18 200) 1px, transparent 1px), linear-gradient(90deg, oklch(0.72 0.18 200) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <div className="relative max-w-4xl mx-auto text-center space-y-8">

        {/* Beta badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-primary/25 text-xs font-semibold text-primary animate-fade-in tracking-wide uppercase">
          <span className="pulse-dot w-1.5 h-1.5" />
          Closed Beta &nbsp;·&nbsp; Professional Trading Workspace
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.04] animate-fade-up">
          Trade smarter.
          <br />
          <span className="text-gradient-cyan">Everything else follows.</span>
        </h1>

        {/* Subheading */}
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-fade-up delay-100">
          Connect your trading account, monitor your portfolio in real time, stay ahead of
          market-moving events, and get AI-powered insights — all from one intelligent workspace.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-up delay-200">
          <Link
            href="/signup"
            id="hero-cta-signup"
            className="group flex items-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-cyan hover:scale-[1.02] active:scale-[0.98]"
          >
            Get Early Access
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-0.5">
              <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <Link
            href="/login"
            id="hero-cta-login"
            className="px-7 py-3.5 rounded-xl glass border border-white/12 text-sm font-medium hover:border-white/22 hover:bg-white/6 transition-all"
          >
            Open Dashboard
          </Link>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2 animate-fade-up delay-300">
          <FeaturePill
            label="Real-Time Portfolio"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18" /><path d="M18 9l-5 5-2-2-4 4" />
              </svg>
            }
          />
          <FeaturePill
            label="AI Trading Insights"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a5 5 0 015 5c0 2.4-1.7 4.4-4 4.9V13h2v2h-2v2h2v2h-2v1h-2v-1H9v-2h2v-2H9v-2h2v-1.1C8.7 11.4 7 9.4 7 7a5 5 0 015-5z" />
              </svg>
            }
          />
          <FeaturePill
            label="Economic Calendar"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            }
          />
          <FeaturePill
            label="Risk Analytics"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L3 7v6c0 5 3.84 9.63 9 11 5.16-1.37 9-6.03 9-11V7L12 2z" />
              </svg>
            }
          />
        </div>
      </div>
    </section>
  );
}

// ── Dashboard preview mockup ───────────────────────────────────────
function DashboardPreview() {
  return (
    <section className="px-6 md:px-12 pb-28">
      <div className="max-w-5xl mx-auto">
        {/* Outer glow ring */}
        <div className="relative">
          <div
            className="absolute -inset-px rounded-2xl opacity-40"
            style={{
              background: "linear-gradient(135deg, oklch(0.72 0.18 200 / 60%), transparent 50%, oklch(0.7 0.18 155 / 30%))",
            }}
          />
          <div className="glass-strong rounded-2xl border border-white/8 overflow-hidden shadow-2xl relative">
            {/* Browser bar */}
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
                {["Dashboard", "Exchanges", "Orders", "Risk Controls", "AI Assistant", "Settings"].map((item, i) => (
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
                      Live · Synced just now
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
                    { label: "Portfolio Value", value: "$12,430.50", sub: "Futures account", color: "text-foreground" },
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
                      { symbol: "BTCUSDT", side: "LONG", size: "0.05", pnl: "+$142.30", entry: "$61,200" },
                      { symbol: "ETHUSDT", side: "SHORT", size: "1.2", pnl: "-$28.50", entry: "$3,280" },
                      { symbol: "SOLUSDT", side: "LONG", size: "8.0", pnl: "+$67.80", entry: "$142.40" },
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
      </div>
    </section>
  );
}

// ── Features section ───────────────────────────────────────────────
function FeaturesSection() {
  const features = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3v18h18" /><path d="M18 9l-5 5-2-2-4 4" />
        </svg>
      ),
      title: "Real-Time Portfolio",
      description:
        "Sync your live trading account — balances, open positions, trade history, and realized PnL. Not public price data. Your actual account data, updated in real time.",
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
        "Track upcoming high-impact macro events that move the market — CPI, FOMC, NFP and more — before they hit your positions. Never be caught off guard.",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
          <path d="M12 8v4l3 3" />
        </svg>
      ),
      title: "AI Trading Insights",
      description:
        "Ask your AI assistant about your own portfolio — positions, PnL, upcoming events. It knows your account, not generic market commentary. Powered by Gemini.",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L3 7v6c0 4.97 3.84 9.63 9 11 5.16-1.37 9-6.03 9-11V7L12 2z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      ),
      title: "Risk Analytics",
      description:
        "Set automated guardrails evaluated before every order — daily loss limits, position size caps, and more. Protect your capital while you focus on trading.",
    },
  ];

  return (
    <section className="px-6 md:px-12 pb-28">
      <div className="max-w-5xl mx-auto space-y-14">
        <div className="text-center space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            One place for your{" "}
            <span className="text-gradient-brand">trading workflow</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base">
            AlgoFin combines the four tools traders currently juggle separately — in one connected, intelligent workspace.
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

// ── Pricing section ────────────────────────────────────────────────
function PricingSection() {
  return (
    <section className="px-6 md:px-12 pb-28" id="pricing">
      <div className="max-w-5xl mx-auto">
        <div className="text-center space-y-4 mb-14">
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

            <ul className="space-y-3">
              <PricingItem text="We take 20% of your profitable months only." />
              <PricingItem text="Zero fee in losing months." />
              <PricingItem text="Estimated at end of each calendar month." />
              <PricingItem text="No payment collected yet — this is a closed beta." />
              <PricingItem text="All manual trades included — AlgoFin doesn't need to place them." positive={false} />
            </ul>

            <div className="border-t border-white/8 pt-5 space-y-3">
              <Link
                href="/signup"
                id="pricing-cta"
                className="flex items-center justify-center w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-cyan-sm"
              >
                Get Early Access
              </Link>
              <p className="text-xs text-muted-foreground text-center">
                Closed beta · Invite required · No payment collected during beta.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── CTA section ────────────────────────────────────────────────────
function CtaSection() {
  return (
    <section className="px-6 md:px-12 pb-28">
      <div className="max-w-3xl mx-auto text-center space-y-8">
        {/* Divider */}
        <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/10 to-transparent mx-auto" />

        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          The workspace that{" "}
          <span className="text-gradient-cyan">knows your account.</span>
        </h2>
        <p className="text-muted-foreground">
          Real-time portfolio · Economic events · AI-powered insights
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            id="cta-section-signup"
            className="group flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all glow-cyan hover:scale-[1.02] active:scale-[0.98]"
          >
            Get Early Access
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-0.5">
              <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <Link
            href="/login"
            id="cta-section-login"
            className="px-8 py-3.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Already have an account →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────
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
          <span>Professional Trading Workspace</span>
          <span>·</span>
          <span>AI-Powered Insights</span>
          <span>·</span>
          <span>Real-Time Portfolio</span>
        </div>
        <p className="text-xs text-muted-foreground">
          © 2026 AlgoFin. Closed beta — not for public use.
        </p>
      </div>
    </footer>
  );
}

// ── Page export ────────────────────────────────────────────────────
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
