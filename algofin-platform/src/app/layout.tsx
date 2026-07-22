import type { Metadata } from "next";
import { Figtree, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ApiWarmupBanner } from "@/components/ApiWarmupBanner";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AlgoFin — Your Binance Futures Dashboard, Upgraded",
    template: "%s | AlgoFin",
  },
  description:
    "Connect your Binance Futures account, track your portfolio in real time, stay ahead of high-impact macro events, and ask your AI assistant anything about your own positions — all in one dashboard.",
  keywords: [
    "Binance Futures",
    "trading dashboard",
    "portfolio tracker",
    "economic calendar",
    "AI trading assistant",
    "crypto trading",
    "realized PnL",
  ],
  authors: [{ name: "AlgoFin" }],
  creator: "AlgoFin",
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "AlgoFin — Your Binance Futures Dashboard, Upgraded",
    description:
      "One place for your trades, events, and portfolio. Real-time Binance Futures data + economic calendar + AI assistant.",
    siteName: "AlgoFin",
  },
  twitter: {
    card: "summary_large_image",
    title: "AlgoFin — Your Binance Futures Dashboard, Upgraded",
    description:
      "One place for your trades, events, and portfolio. Real-time Binance Futures data + economic calendar + AI assistant.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark h-full antialiased",
        figtree.variable,
        geistMono.variable
      )}
    >
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <ApiWarmupBanner />
        {children}
      </body>
    </html>
  );
}
