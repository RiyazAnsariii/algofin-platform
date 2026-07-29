# app/events/blacklist.py
# AlgoFin — Excluded / Blacklisted & Impact Classifier Rules
# Events permanently filtered out to match exact Forex Factory specifications across all dates.

from typing import Optional

EXCLUDED_EXACT_TITLES = {
    # ── Previous Blacklist ───────────────────────────────────────────────────
    "Export Prices q/q",
    "Spanish Prelim CPI m/m",
    "Spanish Prelim Core CPI y/y",
    "Spanish Flash GDP y/y",
    "German Flash GDP y/y",
    "Italian Advance GDP y/y",
    "Eurozone Flash GDP y/y",
    "Italian Unemployment Rate",
    "BoE MPC Vote Unchanged",
    "BoE MPC Vote Hike",
    "BoE MPC Vote Cut",
    "Core PCE Prices q/q Advance",
    "Core PCE Price Index y/y",
    "PCE Prices q/q Advance",
    "PCE Price Index m/m",
    "PCE Price Index y/y",
    # NOTE: BOE Gov Bailey Speaks was previously blacklisted but IS present on FF as 🔴 High (Jul 30 confirmed)
    # — removed from blacklist, now in FORCED_HIGH_IMPACT_PATTERNS instead
    "EIA Natural Gas Stocks Change",

    # ── Jul 31 ForexFactory Cleanups ─────────────────────────────────────────
    "Private Sector Credit y/y",
    "NBS General PMI",
    "Housing Credit m/m",
    "Construction Orders y/y",
    "Nationwide Housing Prices y/y",
    "French Prelim CPI y/y",
    "Early Close Bond Market",
    "Unemployed Persons",
    "German Unemployment Rate",
    "Current Account",
    "Eurozone Flash CPI m/m",
    "Eurozone Flash CPI",
    "Italian Prelim CPI y/y",
    "Employment Cost - Wages q/q",
    "Employment Cost - Benefits q/q",
    "Michigan Current Conditions Final",
    "Michigan Consumer Expectations Final",
    "Budget Balance",
    "Baker Hughes Total Rigs Count",
    "Baker Hughes Oil Rig Count",
    "Prelim CPI y/y",
    "Prelim CPI m/m",

    # ── Aug 03 ForexFactory Cleanups ─────────────────────────────────────────
    "NEVI Manufacturing PMI",
    "Swiss CPI y/y",
    "New Car Sales y/y",
    "New Car Registrations y/y",
    "ISM Manufacturing New Orders",
    "ISM Manufacturing Employment",
    "Treasury Refunding Financing Estimates",
    "Cotality Dwelling Prices m/m",

    # ── Aug 04 ForexFactory Cleanups ─────────────────────────────────────────
    "Household Spending y/y",
    "AIB Manufacturing PMI",
    "AIB Services PMI",
    "LMI Logistics Managers Index",
    "Logistics Managers Index",
    "JOLTs Job Quits",
    "Factory Orders ex Transportation",
    "Total Household Debt",
    "Ai Group Industry Index",
    "Ai Group Manufacturing Index",
    "Ai Group Construction Index",
    "API Crude Oil Stock Change",
    "API Cushing Crude Oil Stock Change",
    "API Gasoline Stock Change",
    "API Distillate Stock Change",
    "Participation Rate",
    "Labour Costs Index y/y",
    "Overtime Pay y/y",
    # NOTE: "Omdia Total Vehicle Sales" and "Total Vehicle Sales" removed — FF Aug 3 All-Day (USD, Low) confirms it IS valid
    # "Wholesale Prices m/m" / "Wholesale Prices y/y" stay blocked — not on FF
    "Wholesale Prices m/m",
    "Wholesale Prices y/y",
    "Global Supply Chain Pressure Index",
    "Consumer Spending y/y",

    # ── Aug 05 ForexFactory Cleanups ─────────────────────────────────────────
    "RatingDog Composite PMI",
    "ISM Services Prices",
    "ISM Services Business Activity",
    "ISM Services Employment",
    "ISM Services New Orders",
    "S&P Global Composite PMI",

    # ── Jul 30 ForexFactory Cleanups (Screenshot cross-reference) ───────────
    "MPC Meeting Minutes",
    "German Prelim CPI y/y",
    "Fed Balance Sheet",
    "Jobs/applications ratio",
    "Flash GDP q/q",
    "GDP q/q",
    # NOTE: "Eurozone Unemployment Rate" was here but FF Jul 30 confirms EUR Unemployment Rate IS valid
    # Removed — it maps to "Unemployment Rate" which is now allowed for EUR via rule 11
    # EUR: FF uses "German Prelim GDP q/q" — data provider sends "German Flash GDP q/q" (wrong title)
    "German Flash GDP q/q",
    # EUR: FF uses "Italian Prelim GDP q/q" (Low) — "Italian Advance GDP q/q" is wrong title AND wrong impact (was High)
    "Italian Advance GDP q/q",
    # EUR: FF uses "Prelim Flash GDP q/q" — "Eurozone Flash GDP q/q" is wrong title
    "Eurozone Flash GDP q/q",

    # ── Jul 29 ForexFactory Cleanups ─────────────────────────────────────────
    # AUD: FF shows "CPI m/m", "CPI y/y", and "Trimmed Mean CPI m/m" — NOT standalone "Trimmed Mean CPI"
    "Trimmed Mean CPI",
    # AUD: FF has CPI m/m / CPI y/y specifically — bare generic "CPI" is NOT a FF event
    "CPI",
    # EUR: FF uses "German Import Prices m/m" — generic "Import Prices m/m" is not listed
    "Import Prices m/m",
    # GBP: Not present on Forex Factory Jul 29
    "Mortgage Lending",
    "BoE Consumer Credit",
    # EUR: Not present on Forex Factory Jul 29 (FF uses "Flash GDP q/q" for Eurozone, not "Advance GDP q/q")
    # Note: USD "Advance GDP q/q" is handled separately via currency-aware rule in is_event_blacklisted
    # EUR: Not present on Forex Factory
    "Wage Growth y/y",
    # JPY: Wrong title format — FF uses "Tokyo Core CPI y/y" (Medium), not these generic national CPI titles
    # TradingView sends "Tokyo Core CPI" which was being incorrectly formatted as "Japanese Core CPI y/y"
    "Japanese Core CPI y/y",
    "Japanese CPI y/y",
    "Japanese CPI m/m",

    # ── Aug 7 (NFP Day) Cleanups ──────────────────────────────────────────────
    # Employment sub-components — NOT on FF (FF shows headline, not breakdowns)
    "French Unemployment Rate",
    "FAO Food Price Index",
    "Average Hourly Earnings y/y",   # Only m/m is on FF (High impact)
}

# 🔴 High Impact (Red Folder) Events on Forex Factory
FORCED_HIGH_IMPACT_PATTERNS = [
    "boe monetary policy report",
    "monetary policy summary",
    "mpc official bank rate votes",
    "official bank rate",
    "advance gdp q/q",
    "core pce price index m/m",
    "fomc press conference",
    "fomc statement",
    "federal funds rate",
    "boj policy rate",
    "boj interest rate decision",
    "boj outlook report",
    "boj quarterly outlook report",
    "boj press conference",
    "boj gov ueda speaks",
    "monetary policy statement",
    "gdp m/m",
    "ism manufacturing pmi",
    "nz unemployment rate",
    "employment change q/q",
    "non-farm employment change",
    "nonfarm payrolls",
    "non farm payrolls",         # TradingView variant of 'Nonfarm Payrolls' (space vs no space)
    "cpi m/m (us)",
    "cpi y/y (us)",
    # AUD CPI releases are 🔴 High impact on Forex Factory (Jul 29 screenshot confirmed)
    "trimmed mean cpi m/m",
    # BOE Gov Bailey Speaks is 🔴 High on Forex Factory (Jul 30 screenshot confirmed)
    "boe gov bailey speaks",
    # USD Aug 7 (NFP day) High impact releases
    "average hourly earnings m/m",  # USD Aug 7 FF confirmed High
]

# 🟠 Medium Impact (Orange Folder) Events on Forex Factory
FORCED_MEDIUM_IMPACT_PATTERNS = [
    "tokyo core cpi",
    "core cpi flash estimate",
    # NOTE: "cpi flash estimate" REMOVED — FF Jul 31 shows bare "CPI Flash Estimate y/y" as Low (yellow folder)
    # Only "Core CPI Flash Estimate y/y" is Medium. The broad "cpi flash estimate" pattern was catching both.
    "employment cost index",
    "chicago pmi",
    "ism manufacturing prices",
    "jolts job openings",
    "adp non-farm employment change",
    "adp employment change",
    "ism services pmi",
    "german prelim cpi m/m",
    "german prelim gdp q/q",
    "advance gdp price index",
    "revised uom consumer sentiment",
    "revised uom inflation expectations",
    "michigan consumer sentiment",
    "michigan 5 year inflation expectations",
    "unemployment claims",
]


def is_forced_high_impact(title: str, currency: Optional[str] = None) -> bool:
    """Check if an economic event title is explicitly classified as High Impact (🔴)."""
    if not title:
        return False
    t_lower = title.strip().lower()
    curr = (currency or "").strip().upper()

    # ADP Non-Farm Employment Change is 🟠 Medium on FF (Aug 5 confirmed) — NOT High
    # 'non-farm employment change' pattern is for non-ADP NFP releases only
    # Skip pattern loop entirely for ADP version
    if "adp" in t_lower:
        return False

    for pattern in FORCED_HIGH_IMPACT_PATTERNS:
        if pattern in t_lower:
            return True

    # AUD CPI m/m and CPI y/y are 🔴 High impact on Forex Factory (confirmed Jul 29)
    if curr == "AUD" and t_lower in ("cpi m/m", "cpi y/y"):
        return True

    # NZD Unemployment Rate is 🔴 High on FF (Aug 5 confirmed)
    if curr == "NZD" and t_lower == "unemployment rate":
        return True

    # CAD Employment Change is 🔴 High on FF (Aug 7 NFP day confirmed)
    if curr == "CAD" and t_lower == "employment change":
        return True

    # CAD Unemployment Rate is 🔴 High on FF (Aug 7 confirmed) — same release as NFP
    if curr == "CAD" and t_lower == "unemployment rate":
        return True

    # USD Unemployment Rate is 🔴 High on FF (Aug 7 confirmed) — released with Nonfarm Payrolls
    if curr == "USD" and t_lower == "unemployment rate":
        return True

    return False


def is_forced_medium_impact(title: str, currency: Optional[str] = None) -> bool:
    """Check if an economic event title is explicitly classified as Medium Impact (🟠)."""
    if not title:
        return False
    t_lower = title.strip().lower()
    curr = (currency or "").strip().upper()

    # CHF CPI m/m is Medium Impact
    if curr == "CHF" and "cpi m/m" in t_lower:
        return True

    for pattern in FORCED_MEDIUM_IMPACT_PATTERNS:
        if pattern in t_lower:
            return True
    return False


def is_event_blacklisted(title: str, currency: Optional[str] = None) -> bool:
    """
    Check if an economic event title matches any permanently excluded event title or pattern.
    Permanently excludes non-ForexFactory events across all dates.
    """
    if not title:
        return False

    t_clean = title.strip()
    curr = (currency or "").strip().upper()
    t_lower = t_clean.lower()

    if t_clean in EXCLUDED_EXACT_TITLES:
        return True

    # Special case: CHF CPI y/y is blacklisted, but CHF CPI m/m is kept
    if curr == "CHF" and ("cpi y/y" in t_lower or "swiss cpi y/y" in t_lower):
        return True

    # Allow authentic NZD employment releases (NZ Unemployment Rate, Employment Change q/q, Labor Cost Index q/q)
    if curr == "NZD":
        if "participation rate" in t_lower or "y/y" in t_lower:
            return True
        if any(k in t_lower for k in ("unemployment rate", "employment change", "labor cost index", "labour cost index")):
            return False

    # 1. Any GDP y/y release (ForexFactory only lists GDP q/q or Flash GDP q/q or GDP m/m)
    if "gdp y/y" in t_lower:
        return True

    # 1a. EUR "Advance GDP q/q" — FF uses "Flash GDP q/q" for Eurozone; only USD uses "Advance GDP q/q"
    if "advance gdp q/q" in t_lower and curr == "EUR":
        return True

    # 2. Export prices & Private Sector Credit y/y & Household Spending y/y & Cotality
    if "export prices" in t_lower or "private sector credit y/y" in t_lower or "household spending y/y" in t_lower or "cotality" in t_lower:
        return True

    # 3. Spanish Prelim CPI m/m / Core CPI y/y / Flash GDP y/y
    if "spanish prelim" in t_lower or "spanish flash gdp y/y" in t_lower:
        return True

    # 4. BoE MPC Votes (Unchanged / Hike / Cut)
    if "mpc vote" in t_lower:
        return True

    # 5. Non-standard PCE releases
    if "pce" in t_lower:
        if "q/q" in t_lower or "y/y" in t_lower or (t_lower.endswith("index m/m") and "core" not in t_lower):
            return True

    # 6. EIA Natural Gas Stocks Change & Rig counts
    if "natural gas stocks change" in t_lower or "rig count" in t_lower or "baker hughes" in t_lower:
        return True

    # 7. Generic Consumer Confidence (keep JPY Consumer Confidence)
    if "consumer confidence" in t_lower:
        if curr == "JPY" and "italian" not in t_lower and "french" not in t_lower and "german" not in t_lower:
            return False
        return True

    # 8. Generic PPI m/m for EUR (allow EUR PPI m/m on Aug 5) / non-US
    if t_lower == "ppi m/m" and curr not in ("USD", "EUR"):
        return True

    # 9. Generic CPI y/y / CPI m/m / Prelim CPI y/y / Prelim CPI m/m
    if t_lower in ("cpi y/y", "cpi m/m", "prelim cpi y/y", "prelim cpi m/m"):
        # CHF CPI m/m is Medium impact — keep it
        if curr == "CHF" and t_lower == "cpi m/m":
            return False
        # AUD CPI m/m and CPI y/y are 🔴 High impact on FF (Jul 29 confirmed) — keep them
        if curr == "AUD" and t_lower in ("cpi m/m", "cpi y/y"):
            return False
        return True

    # 10. Retail Sales m/m for EUR / non-US
    # NOTE: 'German Retail Sales m/m' unblocked (Aug 3), 'Italian Retail Sales m/m' handled by noise filter
    # NOTE: Bare 'Retail Sales m/m' (EUR) = Eurozone Retail Sales — FF Aug 6 confirms it IS valid (2:30pm EUR Low)
    #       Only block COUNTRY-PREFIXED EUR retail sales (French, Spanish, etc.) not the bare Eurozone title
    if "retail sales m/m" in t_lower and curr == "EUR" and "italian" not in t_lower and "german" not in t_lower and t_lower != "retail sales m/m":
        return True

    # 11. Unemployment Rate noise cleanup
    # Italian / German / Unemployed Persons are too granular for FF — always blacklist
    if t_lower in ("italian unemployment rate", "german unemployment rate", "unemployed persons"):
        return True
    if t_lower == "unemployment rate":
        # EUR Unemployment Rate is a valid FF event (Jul 30 screenshot confirmed) — keep it
        # JPY, NZD, CHF already had headline unemployment rate events — keep those too
        # CAD and USD Unemployment Rate are 🔴 High on FF (Aug 7 NFP day confirmed) — keep both
        if curr in ("JPY", "NZD", "CHF", "EUR", "CAD", "USD"):
            return False
        return True

    # 12. BOE Gov Bailey Speaks — REMOVED from blacklist (Jul 30 FF screenshot confirms it IS present as 🔴 High)
    # Now handled via FORCED_HIGH_IMPACT_PATTERNS above.
    # (old rule: if "bailey speaks" in t_lower: return True  — DELETED)

    # 13. Sub-breakdown employment costs & sub-ISM indicators & Wholesale Prices & Supply Chain Index
    # NOTE: 'construction pmi' REMOVED — FF Aug 6 shows GBP Construction PMI (2:00pm Low) IS valid
    if "employment cost -" in t_lower or "housing credit" in t_lower or "ism manufacturing new orders" in t_lower or "ism manufacturing employment" in t_lower or "ism services new orders" in t_lower or "ism services employment" in t_lower or "ism services business activity" in t_lower or "ism services prices" in t_lower or "wholesale prices" in t_lower or "supply chain pressure" in t_lower or "aib services" in t_lower:
        return True

    # 14. Car registrations & Treasury refunding estimates
    if "new car" in t_lower or "treasury refunding" in t_lower:
        return True

    # 15. Minor bond auctions & PMI noise
    # NOTE: 'vehicle sales' removed — 'Omdia Total Vehicle Sales' (USD, Low) is valid on FF (Aug 3 All-Day confirmed)
    if any(k in t_lower for k in ("letras auction", "schatz auction", "ragb auction", "gilt 2032", "tc auction", "logistics managers", "jolts job quits", "total household debt", "composite pmi", "fed balance sheet", "jobs/applications ratio", "bonos y obligations")):
        return True

    # 16. Drop JPY Services PMI
    if "services pmi" in t_lower and curr == "JPY":
        return True

    # 17. NFP sub-components — NOT on FF (Aug 7 confirmed); FF shows only headline numbers
    if any(k in t_lower for k in ("government payrolls", "manufacturing payrolls", "nonfarm payrolls private",
                                   "u-6 unemployment", "full time employment", "part time employment",
                                   "average hourly wages", "average weekly hours", "used car prices")):
        return True

    # 18. Foreign Exchange Reserves — only CHF (Swiss National Bank) is on FF
    # JPY, EUR, CNY Foreign Exchange Reserves are NOT on FF (Aug 7 confirmed)
    if "foreign exchange reserves" in t_lower and curr != "CHF":
        return True

    # 19. EUR & CNY Exports/Imports sub-breakdowns — NOT on FF
    # FF shows Trade Balance (aggregate), not individual Exports/Imports with EUR or CNY
    # Aug 7 confirmed: 'Exports m/m', 'Imports m/m', 'Exports', 'Imports' (EUR) and Exports/Imports y/y (CNY)
    if t_lower in ("exports", "imports", "exports m/m", "imports m/m", "exports y/y", "imports y/y") and curr in ("EUR", "CNY"):
        return True

    # 20. Average Hourly Earnings y/y — only m/m is on FF (High); y/y variant is NOT on FF
    if "average hourly earnings y/y" in t_lower:
        return True

    return False
