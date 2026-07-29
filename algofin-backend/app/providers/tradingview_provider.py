# app/providers/tradingview_provider.py
# AlgoFin v1 — TradingView Economic Calendar Provider
#
# Fetches real, live macroeconomic events from TradingView's public calendar API.
# No API key required. Returns the same real data shown on TradingView.
#
# Importance mapping:
#   1  → High   (red)
#   0  → Medium (brown/orange)
#  -1  → Low    (yellow)

import hashlib
import logging
from datetime import date, datetime, timezone
from typing import List, Optional, Tuple

import httpx

from app.providers.base import BaseEconomicCalendarProvider, NormalizedEventDTO
from app.events.blacklist import (
    is_event_blacklisted,
    is_forced_high_impact,
    is_forced_medium_impact,
)

logger = logging.getLogger(__name__)

# Country code → currency mapping for the most common codes
_COUNTRY_CURRENCY: dict[str, str] = {
    "US": "USD",
    "EU": "EUR",
    "DE": "EUR",
    "FR": "EUR",
    "IT": "EUR",
    "ES": "EUR",
    "PT": "EUR",
    "NL": "EUR",
    "BE": "EUR",
    "AT": "EUR",
    "FI": "EUR",
    "GR": "EUR",
    "IE": "EUR",
    "GB": "GBP",
    "JP": "JPY",
    "CA": "CAD",
    "AU": "AUD",
    "NZ": "NZD",
    "CH": "CHF",
    "CN": "CNY",
    "HK": "HKD",
    "KR": "KRW",
    "SG": "SGD",
    "IN": "INR",
    "BR": "BRL",
    "MX": "MXN",
    "TR": "TRY",
    "RU": "RUB",
    "ZA": "ZAR",
    "NO": "NOK",
    "SE": "SEK",
    "DK": "DKK",
    "PL": "PLN",
    "CZ": "CZK",
    "HU": "HUF",
}

# Country code → full country name
_COUNTRY_NAMES: dict[str, str] = {
    "US": "United States",
    "EU": "Eurozone",
    "DE": "Germany",
    "FR": "France",
    "IT": "Italy",
    "ES": "Spain",
    "GB": "United Kingdom",
    "JP": "Japan",
    "CA": "Canada",
    "AU": "Australia",
    "NZ": "New Zealand",
    "CH": "Switzerland",
    "CN": "China",
    "HK": "Hong Kong",
    "KR": "South Korea",
    "SG": "Singapore",
    "IN": "India",
    "BR": "Brazil",
    "MX": "Mexico",
    "TR": "Turkey",
    "RU": "Russia",
    "ZA": "South Africa",
    "NO": "Norway",
    "SE": "Sweden",
    "DK": "Denmark",
    "PL": "Poland",
    "CZ": "Czech Republic",
    "HU": "Hungary",
    "PT": "Portugal",
    "NL": "Netherlands",
    "BE": "Belgium",
    "AT": "Austria",
    "FI": "Finland",
    "GR": "Greece",
    "IE": "Ireland",
    "CR": "Costa Rica",
}

_IMPORTANCE_MAP = {
    1: "High",
    0: "Medium",
    -1: "Low",
}

# Only store events for the 8 major forex currencies
# All other currencies (CRC, TND, ZAR, INR, BRL, etc.) are filtered out
MAJOR_FOREX_CURRENCIES: frozenset[str] = frozenset({
    "AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "JPY", "NZD", "USD",
})

# ── Event Noise Filter ────────────────────────────────────────────────────────
# Keyword fragments (case-insensitive substring match on event title).
# If ANY keyword appears in the title, the event is discarded.
_NOISE_KEYWORDS: tuple[str, ...] = (
    # Regional / State-level CPI (German states, Italian regions, etc.)
    "bavaria cpi", "hesse cpi", "saxony cpi", "brandenburg cpi",
    "north rhine westphalia", "baden wuerttemberg cpi",
    "thuringia cpi", "mecklenburg cpi", "rhineland cpi",
    "lower saxony cpi", "sachsen", "thueringen",

    # Clutter Auctions & Regional Fed Sub-Components
    "bill auction", "bond auction", "note auction",
    "jgb auction", "btp auction", "oat auction",
    "gilt auction", "bund auction", "treasury auction",
    "bills auction", "ny fed bill", "bill purchases",
    "foreign bond investment", "stock investment by foreigner",
    "olo auction", "btf auction", "atb auction", "gilt tender",
    "richmond fed shipments", "richmond fed services",
    "dallas fed services", "italian 10-year bond", "italian bond auction",

    # Housing noise (Keep FHFA House Price Index y/y / m/m)
    "building permits yoy", "building permits mom",
    "private house approvals",
    "30-year mortgage", "15-year mortgage", "mortgage rate",

    # Sentiment clutter (keep headline Consumer Confidence & Ifo Business Climate)
    "business confidence",
    "industrial sentiment", "services sentiment",
    "economic sentiment", "selling price expectations",
    "consumer inflation expectations",
    "anz business confidence", "kof leading",
    "nab business", "westpac consumer",
    "consumer confidence final",
    "ifo current conditions", "ifo expectations",

    # Leading & Banking Indicators
    "leading economic index", "coincident index", "leading index",
    "total credit",

    # GDP revisions — keep Flash/Advance q/q, drop Preliminary, Final, and Advance y/y permanently
    "gdp qoq prel", "gdp qoq final", "gdp qoq 2nd",
    "gdp yoy prel", "gdp yoy final", "gdp yoy 2nd",
    "gdp mom prel", "gdp mom final",
    "gdp growth rate qoq prel", "gdp growth rate yoy prel",
    "gdp growth rate qoq final", "gdp growth rate yoy final",
    "gdp growth rate 2nd", "gdp price index",
    "advance gdp yoy", "advance gdp y/y",

    # Trimmed Mean CPI noise (drop generic & y/y versions permanently)
    "trimmed mean cpi yoy", "trimmed mean cpi y/y",

    # Low-value / Clutter events explicitly requested for removal
    "jobless claims 4-week", "4-week avg jobless", "4-week average jobless",
    "continuing jobless claims",
    "average weekly earnings",
    "industrial production",
    "industrial sales",
    "retail sales yoy", "retail sales y/y",
    "harmonised inflation", "harmonized inflation", "hicp",
    "ppi yoy", "ppi y/y",
    "import prices yoy", "import prices y/y",
    "non defense goods orders", "ex defense",
    "market participants survey",
    "jgb purchase", "unicredit", "bot auction", "frn auction",
    "mba ", "mba purchase", "mba mortgage",


    # Niche EIA Oil Sub-Reports (Keep headline Crude Oil Inventories)
    "eia gasoline", "eia distillate", "eia refinery", "eia cushing",
    "eia heating oil", "eia crude oil imports", "eia crude oil exports",

    # Holidays / Bank Holidays / National Days (No market data metrics)
    "national day", "bank holiday", "public holiday", "day off",
    "independence day", "constitution day", "republic day",
    "liberation day", "anniversary of", "civic holiday",
    "summer bank holiday", "holiday", "swiss national day",

    # Permanent removals identified from Forex Factory screenshots
    "french consumer confidence",
    "atb auction", "atb 20", "gilt tender", "treasury gilt",
    "btp", "btp€i", "unemployment benefit claims", "jobseekers total",
    "retail inventories", "redbook", "case-shiller home price m/m",
    "s&p/case-shiller home price m/m", "richmond fed manufacturing shipments",
    "richmond manufacturing shipments",

    # Miscellaneous low-value & China clutter
    "tourist arrivals", "car production", "vehicle production",
    "real consumer spending qoq", "real personal spending",
    "gdp sales", "gross fixed capital",
    "capacity utilization",
    "politburo meeting", "industrial profits",

)

# Exact lowercase title matches to drop
_NOISE_EXACT_TITLES: frozenset[str] = frozenset({
    "s&p global manufacturing pmi",
    "building permits",
    "import prices",
    "export prices",
    "export prices q/q",
    "tourist arrivals",
    "car production yoy",
    "continuing jobless claims",
    "boc market participants survey",
    "australian cpi",
    "italian 10-year bond auction",
    "balance of trade",
    "advance gdp y/y",
    "advance gdp yoy",
    "trimmed mean cpi",
    "trimmed mean cpi y/y",
    "trimmed mean cpi yoy",
    "french consumer confidence",
    "house price index",
    "house price index y/y",
    "money supply",
    "redbook y/y",
    "redbook",
    "retail inventories ex autos m/m advance",
    "richmond fed manufacturing shipments index",
    "jobseekers total",
    "unemployment benefit claims",
})


def _is_noise_event(title: str, country: str = "") -> bool:
    """Return True if this event is noise and should be discarded."""
    t = title.lower()
    c_lower = country.lower()
    # Permanently drop Advance GDP y/y
    if "advance gdp" in t and ("y/y" in t or "yoy" in t):
        return True
    # Permanently drop generic Trimmed Mean CPI & Trimmed Mean CPI y/y (keep only m/m / q/q)
    if "trimmed mean cpi" in t and not ("m/m" in t or "q/q" in t or "mom" in t or "qoq" in t):
        return True
    # Permanently drop generic Money Supply (keep M4 Money Supply m/m & M3 Money Supply y/y)
    if t == "money supply":
        return True
    # Permanently drop generic House Price Index and y/y (keep HPI m/m & S&P/CS Composite-20 HPI y/y)
    if ("house price index" in t or "home price" in t) and not ("composite-20" in t or "hpi m/m" in t):
        return True
    # Permanently drop regional European Retail Sales (Spanish, Italian, Austrian, Portuguese, Dutch, Greek)
    if "retail sales" in t and any(c in t for c in ("spanish", "italian", "austrian", "portuguese", "dutch", "greek", "belgian", "irish")):
        return True
    if t == "s&p global manufacturing pmi" and c_lower in ("spain", "es", "italy", "it"):
        return False
    for kw in _NOISE_KEYWORDS:
        if kw in t:
            return True
    return t in _NOISE_EXACT_TITLES





# ── Forex Factory Title Normalizer ──────────────────────────────────────────
import re

_COUNTRY_ADJECTIVES: dict[str, str] = {
    "Germany": "German",
    "France": "French",
    "Spain": "Spanish",
    "Italy": "Italian",
    "Eurozone": "Eurozone",
    "United Kingdom": "UK",
    "Japan": "Japanese",
    "Australia": "Australian",
    "Canada": "Canadian",
    "Switzerland": "Swiss",
    "New Zealand": "NZ",
    "China": "Chinese",
}

_EXACT_TITLE_MAP: dict[str, str] = {
    "Fed Press Conference": "FOMC Press Conference",
    "Fed Interest Rate Decision": "Federal Funds Rate",
    "Federal Reserve Interest Rate Decision": "Federal Funds Rate",
    "BoE Gov Bailey Speech": "BOE Gov Bailey Speaks",
    "BoE Gov Bailey Speaks": "BOE Gov Bailey Speaks",
    "RBA Hunter Speech": "RBA Assist Gov Hunter Speaks",
    "RBA Hunter Speaks": "RBA Assist Gov Hunter Speaks",
    "RBA Official Speech": "RBA Official Speaks",
    "RBA Gov Bullock Speech": "RBA Gov Bullock Speaks",
    "RBNZ Gov Orr Speech": "RBNZ Gov Orr Speaks",
    "BOC Gov Macklem Speech": "BOC Gov Macklem Speaks",
    "SNB Chairman Schlegel Speech": "SNB Chairman Schlegel Speaks",
    "ECB Pres Lagarde Speech": "ECB Pres Lagarde Speaks",
    "Durable Goods Orders Ex Transport": "Core Durable Goods Orders m/m",
    "Durable Goods Orders Ex Transp m/m": "Core Durable Goods Orders m/m",
    "Durable Goods Orders Ex Transp": "Core Durable Goods Orders m/m",
    "Durable Goods Orders Ex Transportation": "Core Durable Goods Orders m/m",
    "Durable Goods Orders MoM": "Durable Goods Orders m/m",
    "CBI Distributive Trades": "CBI Realized Sales",
    "CBI Distributive Trades Survey": "CBI Realized Sales",
    "API Crude Oil Stock Change": "API Weekly Statistical Bulletin",
    "API Crude Oil Stock": "API Weekly Statistical Bulletin",
    "API Weekly Crude Oil Stock": "API Weekly Statistical Bulletin",
    "EIA Crude Oil Stocks Change": "Crude Oil Inventories",
    "BRC Shop Price Inflation": "BRC Shop Price Index y/y",
    "CB Consumer Confidence": "Conference Board Consumer Confidence",
    "PPI m/m": "Producer Price Index (PPI) m/m",
    "BoC Summary of Deliberations": "BOC Summary of Deliberations",
    "M4 Money Supply": "M4 Money Supply m/m",
    "M4 Money Supply MoM": "M4 Money Supply m/m",
    "Net Lending to Individuals": "Net Lending to Individuals m/m",
    "Net Lending to Individuals MoM": "Net Lending to Individuals m/m",
    "German 10-Yr Bond Auction": "German 10-y Bond Auction",
    "BoE Monetary Policy Report": "BOE Monetary Policy Report",
    "BoJ Interest Rate Decision": "BOJ Policy Rate",
    "BoJ Quarterly Outlook Report": "BOJ Outlook Report",
    "BoJ Gov Ueda Speaks": "BOJ Press Conference",
    "NBS Manufacturing PMI": "Manufacturing PMI",
    "NBS Non Manufacturing PMI": "Non-Manufacturing PMI",
    "Nationwide Housing Prices m/m": "Nationwide HPI m/m",
    "Eurozone Flash Core CPI y/y": "Core CPI Flash Estimate y/y",
    "Eurozone Flash CPI y/y": "CPI Flash Estimate y/y",
    "Canadian GDP m/m": "GDP m/m",
    "ANZ-Indeed Job Ads m/m": "ANZ Job Advertisements m/m",
    "Global Dairy Trade Price Index": "GDT Price Index",
    "RCM/TIPP Economic Optimism Index": "RCM/TIPP Economic Optimism",
    "Total Vehicle Sales": "Omdia Total Vehicle Sales",
    "JOLTs Job Openings": "JOLTS Job Openings",
    "BoE Monetary Policy Summary": "Monetary Policy Summary",
    "Monetary Policy Summary": "Monetary Policy Summary",
    "BoE MPC Rate Votes": "MPC Official Bank Rate Votes",
    "MPC Rate Votes": "MPC Official Bank Rate Votes",
    "BoE Interest Rate Decision": "Official Bank Rate",
    "Initial Jobless Claims": "Unemployment Claims",
    "ADP Employment Change": "ADP Non-Farm Employment Change",
    "ADP Nonfarm Employment Change": "ADP Non-Farm Employment Change",
    "Labour Costs Index q/q": "Labor Cost Index q/q",
    "Labor Cost Index": "Labor Cost Index q/q",
    "BoJ Monetary Policy Meeting Minutes": "Monetary Policy Meeting Minutes",
    "Personal Income": "Personal Income m/m",
    "Personal Income MoM": "Personal Income m/m",
    "Personal Spending": "Personal Spending m/m",
    "Personal Spending MoM": "Personal Spending m/m",
    "EIA Natural Gas Storage Change": "Natural Gas Storage",
    "Natural Gas Storage Change": "Natural Gas Storage",
    "French Non-Farm Payrolls": "French Prelim Private Payrolls q/q",
    "French Private Payrolls": "French Prelim Private Payrolls q/q",
    "German Flash GDP q/q": "German Prelim GDP q/q",
    "Italian Advance GDP q/q": "Italian Prelim GDP q/q",
    "Eurozone Unemployment Rate": "Unemployment Rate",
    "Eurozone Prelim GDP": "Prelim Flash GDP q/q",
    "Eurozone Flash GDP q/q": "Prelim Flash GDP q/q",
    "Italian 10-Yr Bond Auction": "Italian 10-y Bond Auction",
    "Italian 10-Year Bond Auction": "Italian 10-y Bond Auction",
    "Building Approvals": "Building Approvals m/m",
    "Building Approvals MoM": "Building Approvals m/m",
    "Import Prices QoQ": "Import Prices q/q",
    "Services Producer Price Index y/y": "SPPI y/y",
    "Services Producer Price Index YoY": "SPPI y/y",
    "SPPI YoY": "SPPI y/y",
    "Ifo Business Climate": "German ifo Business Climate",
    "German Ifo Business Climate": "German ifo Business Climate",
    "M3 Money Supply": "M3 Money Supply y/y",
    "M3 Money Supply YoY": "M3 Money Supply y/y",
    "Loans to Households y/y": "Private Loans y/y",
    "Private Loans YoY": "Private Loans y/y",
    "Ecofin Meeting": "ECOFIN Meetings",
    "Ecofin Meetings": "ECOFIN Meetings",
    "Durable Goods Orders": "Durable Goods Orders m/m",
    "Conference Board Consumer Confidence": "CB Consumer Confidence",
    "RBA Gov Bullock Speech": "RBA Gov Bullock Speaks",
    "BoJ Core CPI": "BOJ Core CPI y/y",
    "BoJ Core CPI y/y": "BOJ Core CPI y/y",
    "BOJ Core CPI": "BOJ Core CPI y/y",
    "Spanish Unemployment": "Spanish Unemployment Rate",
    "Bundesbank Monthly Report": "German Buba Monthly Report",
    "German Buba Report": "German Buba Monthly Report",
    "ADP Employment Change Weekly": "ADP Weekly Employment Change",
    "Goods Trade Balance Advance": "Goods Trade Balance",
    "Advance Goods Trade Balance": "Goods Trade Balance",
    "Wholesale Inventories m/m Advance": "Prelim Wholesale Inventories m/m",
    "Advance Wholesale Inventories m/m": "Prelim Wholesale Inventories m/m",
    "FHFA House Price Index m/m": "HPI m/m",
    "House Price Index m/m": "HPI m/m",
    "Case-Shiller Home Price Index": "S&P/CS Composite-20 HPI y/y",
    "S&P/CS Composite-20 HPI YoY": "S&P/CS Composite-20 HPI y/y",
    "Richmond Fed Manufacturing Index": "Richmond Manufacturing Index",
}


def _format_title_forex_factory_style(title: str, country: str = "") -> str:
    """Transform TradingView raw titles into standard Forex Factory style names."""
    if title in _EXACT_TITLE_MAP:
        return _EXACT_TITLE_MAP[title]

    t_clean = title.strip()
    t_lower = t_clean.lower()

    if "nationwide" in t_lower:
        return "Nationwide HPI m/m"
    if "michigan" in t_lower and "sentiment" in t_lower:
        return "Revised UoM Consumer Sentiment"
    if "michigan" in t_lower and ("inflation" in t_lower or "5 year" in t_lower):
        return "Revised UoM Inflation Expectations"
    if "ueda" in t_lower and ("speak" in t_lower or "speech" in t_lower):
        return "BOJ Press Conference"
    if "core" in t_lower and "flash" in t_lower and ("cpi" in t_lower or "inflation" in t_lower):
        return "Core CPI Flash Estimate y/y"
    if "flash" in t_lower and ("cpi" in t_lower or "inflation" in t_lower):
        return "CPI Flash Estimate y/y"
    if country in ("Canada", "CA") and "gdp" in t_lower:
        return "GDP m/m"
    if "unemployment change" in t_lower:
        if country in ("Spain", "ES"):
            return "Spanish Unemployment Change"
        if country in ("Germany", "DE"):
            return "German Unemployment Change"
    if "job ad" in t_lower:
        return "ANZ Job Advertisements m/m"
    if "nonfarm productivity" in t_lower:
        return "Prelim Nonfarm Productivity q/q"
    if "unit labour costs" in t_lower or "unit labor costs" in t_lower:
        return "Prelim Unit Labor Costs q/q"
    if "challenger job" in t_lower:
        return "Challenger Job Cuts y/y"
    if country in ("Germany", "DE") and "factory orders" in t_lower:
        return "German Factory Orders m/m"
    if country in ("France", "FR") and ("private payroll" in t_lower or "non farm payroll" in t_lower):
        return "French Prelim Private Payrolls q/q"
    if any(k in t_lower for k in ("exports", "imports", "trade balance")):
        if country in ("United States", "US", "Canada", "CA"):
            return "Trade Balance"
        if country in ("Australia", "AU"):
            return "Trade Balance m/m"
    if "inflation gauge" in t_lower:
        return "MI Inflation Gauge m/m"
    if country in ("Switzerland", "CH") and ("cpi" in t_lower or "inflation" in t_lower):
        period = "m/m" if ("mom" in t_lower or "m/m" in t_lower) else ("y/y" if ("yoy" in t_lower or "y/y" in t_lower) else "m/m")
        return f"CPI {period}"
    if "manufacturing pmi" in t_lower and "ism" not in t_lower and "ratingdog" not in t_lower and "caixin" not in t_lower:
        is_final = "final" in t_lower
        if country in ("Japan", "JP", "Eurozone", "EU", "United Kingdom", "GB", "United States", "US"):
            return "Final Manufacturing PMI" if is_final else "Manufacturing PMI"
        if country in ("France", "FR"):
            return "French Final Manufacturing PMI" if is_final else "French Manufacturing PMI"
        if country in ("Germany", "DE"):
            return "German Final Manufacturing PMI" if is_final else "German Manufacturing PMI"
        if country in ("Spain", "ES"):
            return "Spanish Manufacturing PMI"
        if country in ("Italy", "IT"):
            return "Italian Manufacturing PMI"
        if country in ("Switzerland", "CH"):
            return "Manufacturing PMI"
    if "services pmi" in t_lower and "ism" not in t_lower and "ratingdog" not in t_lower and "caixin" not in t_lower:
        is_final = "final" in t_lower
        if country in ("Eurozone", "EU", "United Kingdom", "GB", "United States", "US"):
            return "Final Services PMI" if is_final else "Services PMI"
        if country in ("France", "FR"):
            return "French Final Services PMI" if is_final else "French Services PMI"
        if country in ("Germany", "DE"):
            return "German Final Services PMI" if is_final else "German Services PMI"
        if country in ("Spain", "ES"):
            return "Spanish Services PMI"
        if country in ("Italy", "IT"):
            return "Italian Services PMI"

    t = title
    adj = _COUNTRY_ADJECTIVES.get(country, "")

    # 1. Household Consumption / Consumer Spending -> French Consumer Spending m/m, etc.
    if "Household Consumption" in t:
        period = "m/m" if ("MoM" in t or "m/m" in t) else ("y/y" if ("YoY" in t or "y/y" in t) else "")
        return f"{adj} Consumer Spending {period}".strip() if adj else f"Consumer Spending {period}".strip()

    # 2. Consumer Confidence: Eurozone Consumer Confidence, or generic Consumer Confidence (Japan/US)
    if t.strip() == "Consumer Confidence" or t.strip() == "Consumer Confidence Indicator":
        if country in ("Eurozone", "EU", "European Union"):
            return "Eurozone Consumer Confidence"
        if country in ("Japan", "JP"):
            return "Consumer Confidence"
        return f"{adj} Consumer Confidence".strip() if adj else "Consumer Confidence"

    # 3. Country-specific GDP: French Flash GDP q/q, German Prelim GDP q/q, Italian Prelim GDP q/q, Prelim Flash GDP q/q
    if "gdp" in t_lower and "price index" not in t_lower:
        period = "q/q" if ("qoq" in t_lower or "q/q" in t_lower) else ("y/y" if ("yoy" in t_lower or "y/y" in t_lower) else ("m/m" if ("mom" in t_lower or "m/m" in t_lower) else "q/q"))
        if country in ("Germany", "DE"):
            return f"German Prelim GDP {period}"
        if country in ("Italy", "IT"):
            return f"Italian Prelim GDP {period}"
        if country in ("Spain", "ES"):
            return f"Spanish Flash GDP {period}"
        if country in ("France", "FR"):
            return f"French Flash GDP {period}"
        if country in ("Eurozone", "EU"):
            return f"Prelim Flash GDP {period}"
        if country in ("United States", "US") and ("advance" in t_lower or "adv" in t_lower):
            return f"Advance GDP {period}"
        prefix = f"{adj} " if adj else ""
        return f"{prefix}GDP {period}".strip()

    # 4. Country-specific CPI: German Prelim CPI y/y, French Flash CPI m/m, CPI m/m (Australia/AUD), etc.
    if "Inflation Rate" in t or "CPI" in t:
        period = "y/y" if ("YoY" in t or "y/y" in t) else ("m/m" if ("MoM" in t or "m/m" in t) else "")
        tag = ""
        if "Flash" in t:
            tag = "Flash "
        elif "Prel" in t or "Preliminary" in t:
            tag = "Prelim "

        cpi_type = "Core CPI" if "Core" in t else ("Trimmed Mean CPI" if "Trimmed" in t else "CPI")

        if country in ("Australia", "AU"):
            return f"{tag}{cpi_type} {period}".strip() if period else f"{tag}{cpi_type}".strip()

        if country in ("United States", "US"):
            return f"{cpi_type} {period}".strip() if period else f"{cpi_type}"

        prefix = f"{adj} " if adj else ""
        return f"{prefix}{tag}{cpi_type} {period}".strip()

    # 5. Country-prefixed Unemployment Rate for non-US
    if t.strip() == "Unemployment Rate" and adj and country not in ("United States", "US"):
        return f"{adj} Unemployment Rate"

    # 6. Standard Forex Factory format conversions
    t = re.sub(r"\bGDP Growth Rate\b", "GDP", t)
    t = re.sub(r"\bMoM\b", "m/m", t)
    t = re.sub(r"\bYoY\b", "y/y", t)
    t = re.sub(r"\bQoQ\b", "q/q", t)
    t = re.sub(r"\bSpeech\b", "Speaks", t)
    t = re.sub(r"\bAdv\b", "Advance", t)
    t = re.sub(r"\bPrel\b", "Prelim", t)

    # Clean up whitespace
    return re.sub(r"\s+", " ", t).strip()


# ── Forex Factory Impact Classifier ──────────────────────────────────────────
def _determine_impact_level(formatted_title: str, default_impact: str, currency: str = "") -> str:
    """Classify event impact as High (🔴), Medium (🟠), or Low (🟡) matching Forex Factory screenshots 1:1."""
    curr = (currency or "").strip().upper()

    if is_forced_high_impact(formatted_title, curr):
        return "High"
    if is_forced_medium_impact(formatted_title, curr):
        return "Medium"

    t = formatted_title.lower()

    # 1. High Impact 🔴 (Strict Red folder events per Forex Factory screenshots)
    if any(k in t for k in (
        "rba gov bullock speaks", "rba gov bullock speech",
        "fomc press conference", "fomc statement",
        "boe monetary policy report", "monetary policy summary",
        "mpc official bank rate votes", "official bank rate", "federal funds rate",
        "advance gdp q/q", "core pce price index m/m",
        "trimmed mean cpi m/m", "non-farm payrolls", "nonfarm payrolls",
        "boj policy rate", "boj interest rate decision", "boj outlook report",
        "boj press conference", "gdp m/m",
        # BOE Gov Bailey Speaks is 🔴 High on Forex Factory (Jul 30 confirmed)
        "boe gov bailey speaks",
    )):
        return "High"

    # AUD CPI m/m and CPI y/y are 🔴 High impact
    if curr == "AUD" and t in ("cpi m/m", "cpi y/y"):
        return "High"

    # 2. Medium Impact 🟠 (Strict Orange folder events per Forex Factory screenshots)
    if any(k in t for k in (
        "cb consumer confidence", "conference board consumer confidence",
        "german prelim cpi", "german prelim gdp",
        "advance gdp price index", "unemployment claims",
        "initial jobless claims", "producer price index", "retail sales",
        "tokyo core cpi", "core cpi flash estimate", "cpi flash estimate",
        "employment cost index",
    )):
        return "Medium"

    # 3. Force Low Impact 🟡 (All Low events matching Forex Factory screenshots)
    if any(k in t for k in (
        "brc shop price index", "boj core cpi", "spanish unemployment rate",
        "german buba monthly report", "adp weekly employment change",
        "goods trade balance", "prelim wholesale inventories", "hpi m/m",
        "s&p/cs composite-20", "richmond manufacturing index",
        "sppi", "ifo business climate", "m3 money supply", "private loans",
        "ecofin meetings", "cbi realized sales", "durable goods orders",
        "rba assist gov hunter", "hunter speaks",
        "anz business confidence", "building approvals",
        "import prices", "export prices", "consumer confidence",
        "french consumer spending", "french flash gdp", "french prelim",
        "kof economic", "kof leading",
        "spanish flash cpi", "spanish flash gdp",
        "italian prelim gdp", "italian monthly unemployment",
        "prelim flash gdp", "unemployment rate",
        "italian 10-y bond", "german 10-y bond",
        "personal income", "personal spending",
        "natural gas", "natural gas storage",
        "api weekly statistical bulletin", "api weekly crude",
        "german import prices", "ubs economic expectations",
        "m4 money supply", "mortgage approvals", "net lending to individuals",
        "crude oil inventories", "boc summary of deliberations",
    )):
        return "Low"

    return "Low"




_TV_CALENDAR_URL = "https://economic-calendar.tradingview.com/events"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.tradingview.com",
    "Referer": "https://www.tradingview.com/",
    "Connection": "keep-alive",
}


def _format_value(raw: Optional[float], unit: str = "") -> Optional[str]:
    """Format a numeric value into a display string."""
    if raw is None:
        return None
    if unit == "%":
        return f"{raw:g}%"
    if abs(raw) >= 1_000_000:
        return f"{raw / 1_000_000:.2f}M"
    if abs(raw) >= 1_000:
        return f"{raw:,.0f}K" if raw == int(raw) else f"{raw:,.2f}K"
    return f"{raw:g}"


class TradingViewProvider(BaseEconomicCalendarProvider):
    """
    Live Economic Calendar Provider using TradingView's public calendar API.
    No API key required. Returns real-time macroeconomic event data.
    """

    provider_name: str = "TradingView"
    provider_version: str = "v1"

    def __init__(self) -> None:
        self.connect_timeout: float = 5.0
        self.read_timeout: float = 15.0

    async def fetch_events(
        self, from_date: date, to_date: date
    ) -> Tuple[List[NormalizedEventDTO], int]:
        """
        Fetch economic events from TradingView public calendar API.
        Returns a normalized list of events + HTTP status code.
        """
        from_str = f"{from_date.isoformat()}T00:00:00Z"
        to_str = f"{to_date.isoformat()}T23:59:59Z"

        params = {
            "from": from_str,
            "to": to_str,
            "lang": "en",
        }

        timeout = httpx.Timeout(self.read_timeout, connect=self.connect_timeout)

        try:
            async with httpx.AsyncClient(timeout=timeout, headers=_HEADERS) as client:
                response = await client.get(_TV_CALENDAR_URL, params=params)
                status_code = response.status_code

                if status_code != 200:
                    logger.warning(
                        f"[TradingViewProvider] Unexpected status {status_code}."
                    )
                    return [], status_code

                payload = response.json()
                raw_events: list[dict] = payload.get("result", [])

                dtos = self._normalize_events(raw_events)
                logger.info(
                    f'{{"event": "economic_calendar_sync_success", "provider": "TradingView", '
                    f'"provider_version": "v1", "events_fetched": {len(dtos)}, "status_code": 200}}'
                )
                return dtos, 200

        except httpx.TimeoutException as exc:
            logger.error(f"[TradingViewProvider] Timeout: {exc}")
            return [], 504
        except httpx.ConnectError as exc:
            logger.error(f"[TradingViewProvider] Connection error: {exc}")
            return [], 503
        except Exception as exc:
            logger.error(f"[TradingViewProvider] Unexpected error: {exc}")
            return [], 500

    def _normalize_events(self, raw_events: list[dict]) -> List[NormalizedEventDTO]:
        """
        Normalize TradingView raw events into provider-agnostic NormalizedEventDTO objects.
        Collapse duplicate sub-series events into headline releases matching Forex Factory.
        """
        dtos: List[NormalizedEventDTO] = []
        seen_keys: set[tuple[str, str, datetime]] = set()

        for item in raw_events:
            try:
                # Parse event time
                date_str: Optional[str] = item.get("date")
                if not date_str:
                    continue
                event_dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                if event_dt.tzinfo is None:
                    event_dt = event_dt.replace(tzinfo=timezone.utc)

                # Resolve country / currency
                country_code: str = item.get("country", "")
                currency: str = item.get("currency") or _COUNTRY_CURRENCY.get(country_code, country_code)
                country: str = _COUNTRY_NAMES.get(country_code, country_code)

                # Skip non-major-forex currencies (CRC, TND, ZAR, INR, BRL, etc.)
                if currency not in MAJOR_FOREX_CURRENCIES:
                    continue


                # Map importance: 1=High, 0=Medium, -1=Low
                importance: int = item.get("importance", -1)
                impact: str = _IMPORTANCE_MAP.get(importance, "Low")

                # Format numeric values
                unit: str = item.get("unit", "")
                actual_raw = item.get("actualRaw")
                forecast_raw = item.get("forecastRaw")
                previous_raw = item.get("previousRaw")

                actual = _format_value(actual_raw, unit)
                forecast = _format_value(forecast_raw, unit)
                previous = _format_value(previous_raw, unit)

                # Compute deterministic hash for deduplication
                provider_event_id = str(item.get("id", ""))
                hash_input = f"TV|{provider_event_id}|{event_dt.isoformat()}".encode("utf-8")
                event_hash = hashlib.sha256(hash_input).hexdigest()

                raw_title: str = item.get("title") or item.get("indicator") or "Unknown Event"
                category: str = str(item.get("category", "")).lower()
                source: str = item.get("source") or "TradingView"

                # Drop noisy / low-value events & holidays (Swiss National Day, Bank Holidays, etc.)
                if "holiday" in category or _is_noise_event(raw_title, country=country) or is_event_blacklisted(raw_title, currency):
                    continue

                title: str = _format_title_forex_factory_style(raw_title, country=country)
                if is_event_blacklisted(title, currency):
                    continue
                impact = _determine_impact_level(title, default_impact=impact, currency=currency)

                # Batch deduplication: keep only one headline release per (title, currency, time)
                dedup_key = (title, currency, event_dt)
                if dedup_key in seen_keys:
                    continue
                seen_keys.add(dedup_key)

                dto = NormalizedEventDTO(
                    provider_event_id=provider_event_id,
                    event_hash=event_hash,
                    title=title,
                    country=country,
                    currency=currency,
                    impact=impact,
                    event_time_utc=event_dt,
                    actual=actual,
                    forecast=forecast,
                    previous=previous,
                    source=source,
                    raw_payload={
                        "id": provider_event_id,
                        "ticker": item.get("ticker"),
                        "indicator": item.get("indicator"),
                        "category": item.get("category"),
                        "comment": item.get("comment", "")[:500],  # Truncate long comments
                        "period": item.get("period"),
                        "source_url": item.get("source_url"),
                    },
                )
                dtos.append(dto)


            except Exception as exc:
                logger.warning(f"[TradingViewProvider] Skipping malformed event: {exc} | Raw: {item}")
                continue

        # Sort chronologically ascending
        dtos.sort(key=lambda x: x.event_time_utc)
        return dtos
