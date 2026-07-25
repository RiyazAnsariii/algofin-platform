# app/events/blacklist.py
# AlgoFin — Excluded / Blacklisted & Impact Classifier Rules
# Events permanently filtered out to match exact Forex Factory specifications across all dates.

from typing import Optional

EXCLUDED_EXACT_TITLES = {
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
]


def is_forced_high_impact(title: str) -> bool:
    """
    Check if an economic event title is explicitly classified as High Impact (🔴).
    """
    if not title:
        return False
    t_lower = title.strip().lower()
    for pattern in FORCED_HIGH_IMPACT_PATTERNS:
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

    # 1. Any GDP y/y release (ForexFactory only lists GDP q/q or Flash GDP q/q)
    if "gdp y/y" in t_lower:
        return True

    # 2. Export prices
    if "export prices" in t_lower:
        return True

    # 3. Spanish Prelim CPI m/m / Core CPI y/y / Flash GDP y/y
    if "spanish prelim" in t_lower or "spanish flash gdp" in t_lower:
        return True

    # 4. BoE MPC Votes (Unchanged / Hike / Cut)
    if "mpc vote" in t_lower:
        return True

    # 5. Non-standard PCE releases (ForexFactory only lists Core PCE Price Index m/m)
    if "pce" in t_lower:
        if "q/q" in t_lower or "y/y" in t_lower or (t_lower.endswith("index m/m") and "core" not in t_lower):
            return True

    # 6. EIA Natural Gas Stocks Change (ForexFactory uses Natural Gas Storage)
    if "natural gas stocks change" in t_lower:
        return True

    # 7. Generic Consumer Confidence (ForexFactory uses CB Consumer Confidence or UMich Consumer Sentiment)
    if t_lower == "consumer confidence" or t_lower.endswith(" consumer confidence"):
        return True

    # 8. Generic PPI m/m (keep only US PPI / Core PPI)
    if t_lower == "ppi m/m" or ("ppi m/m" in t_lower and curr != "USD"):
        return True

    # 9. Generic CPI y/y / CPI m/m (keep US / UK / German / French CPI)
    if t_lower in ("cpi y/y", "cpi m/m") or (t_lower in ("cpi y/y", "cpi m/m") and curr == "EUR"):
        return True

    # 10. Retail Sales m/m for EUR / non-US
    if "retail sales m/m" in t_lower and (curr == "EUR" or t_lower == "retail sales m/m"):
        return True

    # 11. Italian Unemployment Rate (ForexFactory uses Italian Monthly Unemployment Rate)
    if t_lower == "italian unemployment rate":
        return True

    # 12. BOE Gov Bailey Speaks for this period
    if "bailey speaks" in t_lower:
        return True

    return False
