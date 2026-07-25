# app/events/blacklist.py
# AlgoFin — Excluded / Blacklisted Economic Events
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


def is_event_blacklisted(title: str, currency: Optional[str] = None) -> bool:
    """
    Check if an economic event title matches any permanently excluded event title or pattern.
    Permanently excludes non-ForexFactory events across all dates.
    """
    if not title:
        return False

    t_clean = title.strip()
    curr = (currency or "").strip().upper()

    if t_clean in EXCLUDED_EXACT_TITLES:
        return True

    t_lower = t_clean.lower()

    # 1. Any GDP y/y release (ForexFactory only lists GDP q/q)
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

    # 7. Specific EUR events not listed separately on ForexFactory
    if curr == "EUR":
        if "ppi m/m" in t_lower:
            return True
        if "consumer confidence" in t_lower:
            return True
        if "retail sales m/m" in t_lower:
            return True
        if t_lower in ("cpi y/y", "cpi m/m", "flash gdp y/y"):
            return True

    # 8. Italian Unemployment Rate (ForexFactory uses Italian Monthly Unemployment Rate)
    if t_lower == "italian unemployment rate":
        return True

    # 9. BOE Gov Bailey Speaks for this period
    if "bailey speaks" in t_lower:
        return True

    return False
