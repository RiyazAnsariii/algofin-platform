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
    "BOE Gov Bailey Speaks",
    "BoE Gov Bailey Speaks",
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
    "S&P Global Manufacturing PMI",

    # ── Aug 04 ForexFactory Cleanups ─────────────────────────────────────────
    "Household Spending y/y",
    "AIB Manufacturing PMI",
    "LMI Logistics Managers Index",
    "Logistics Managers Index",
    "JOLTs Job Quits",
    "Factory Orders ex Transportation",
    "Total Household Debt",
    "Ai Group Industry Index",
    "Ai Group Manufacturing Index",
    "Ai Group Construction Index",

    # ── Aug 05 ForexFactory Cleanups ─────────────────────────────────────────
    "RatingDog Composite PMI",
    "ISM Services Prices",
    "ISM Services Business Activity",
    "ISM Services Employment",
    "ISM Services New Orders",
    "S&P Global Composite PMI",

    # ── Jul 30 ForexFactory Cleanups ─────────────────────────────────────────
    "MPC Meeting Minutes",
    "German Prelim CPI y/y",
    "Fed Balance Sheet",
    "Jobs/applications ratio",
    "Flash GDP q/q",
    "GDP q/q",
    "Eurozone Unemployment Rate",
}

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
]

FORCED_MEDIUM_IMPACT_PATTERNS = [
    "tokyo core cpi",
    "core cpi flash estimate",
    "cpi flash estimate",
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
]


def is_forced_high_impact(title: str) -> bool:
    """Check if an economic event title is explicitly classified as High Impact (🔴)."""
    if not title:
        return False
    t_lower = title.strip().lower()
    for pattern in FORCED_HIGH_IMPACT_PATTERNS:
        if pattern in t_lower:
            return True
    return False


def is_forced_medium_impact(title: str) -> bool:
    """Check if an economic event title is explicitly classified as Medium Impact (🟠)."""
    if not title:
        return False
    t_lower = title.strip().lower()
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

    # Allow authentic NZD employment releases
    if curr == "NZD" and any(k in t_lower for k in ("unemployment rate", "employment change", "labor cost index", "labour costs index")):
        return False

    # 1. Any GDP y/y release (ForexFactory only lists GDP q/q or Flash GDP q/q or GDP m/m)
    if "gdp y/y" in t_lower:
        return True

    # 2. Export prices & Private Sector Credit y/y & Household Spending y/y
    if "export prices" in t_lower or "private sector credit y/y" in t_lower or "household spending y/y" in t_lower:
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

    # 8. Generic PPI m/m for EUR (except Aug 5) / non-US
    if t_lower == "ppi m/m" and curr != "USD":
        return True

    # 9. Generic CPI y/y / CPI m/m / Prelim CPI y/y / Prelim CPI m/m
    if t_lower in ("cpi y/y", "cpi m/m", "prelim cpi y/y", "prelim cpi m/m"):
        if curr == "CHF" and t_lower == "cpi m/m":
            return False
        return True

    # 10. Retail Sales m/m for EUR / non-US
    if "retail sales m/m" in t_lower and (curr == "EUR" or t_lower == "retail sales m/m") and "italian" not in t_lower:
        return True

    # 11. Italian Unemployment Rate / German Unemployment Rate / Unemployed Persons / Generic Unemployment Rate
    if t_lower in ("italian unemployment rate", "german unemployment rate", "unemployed persons"):
        return True

    # 12. BOE Gov Bailey Speaks
    if "bailey speaks" in t_lower:
        return True

    # 13. Sub-breakdown employment costs & sub-ISM indicators
    if "employment cost -" in t_lower or "housing credit" in t_lower or "ism manufacturing new orders" in t_lower or "ism manufacturing employment" in t_lower or "ism services new orders" in t_lower or "ism services employment" in t_lower or "ism services business activity" in t_lower or "ism services prices" in t_lower:
        return True

    # 14. Car registrations & Treasury refunding estimates
    if "new car" in t_lower or "treasury refunding" in t_lower:
        return True

    # 15. Minor bond auctions & PMI noise
    if any(k in t_lower for k in ("letras auction", "schatz auction", "ragb auction", "gilt 2032", "tc auction", "logistics managers", "jolts job quits", "total household debt", "composite pmi", "fed balance sheet", "jobs/applications ratio")):
        return True

    # 16. Drop JPY Services PMI
    if "services pmi" in t_lower and curr == "JPY":
        return True

    return False
