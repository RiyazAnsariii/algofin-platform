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

    # Bond / Bill Auctions
    "bill auction", "bond auction", "note auction",
    "jgb auction", "btp auction", "oat auction",
    "gilt auction", "bund auction", "treasury auction",
    "bills auction", "ny fed bill", "bill purchases",
    "foreign bond investment", "stock investment by foreigner",

    # Housing noise
    "building permits yoy", "building permits mom",
    "private house approvals",
    "import prices", "export prices",
    "30-year mortgage", "15-year mortgage", "mortgage rate",

    # Sentiment clutter (keep only Consumer Confidence)
    "business confidence",
    "industrial sentiment", "services sentiment",
    "economic sentiment", "selling price expectations",
    "consumer inflation expectations",
    "anz business confidence", "kof leading",
    "nab business", "westpac consumer",
    "consumer confidence final",

    # GDP revisions — keep Flash/Advance, drop Preliminary & Final
    "gdp qoq prel", "gdp qoq final", "gdp qoq 2nd",
    "gdp yoy prel", "gdp yoy final", "gdp yoy 2nd",
    "gdp mom prel", "gdp mom final",
    "gdp growth rate qoq prel", "gdp growth rate yoy prel",
    "gdp growth rate qoq final", "gdp growth rate yoy final",
    "gdp growth rate 2nd", "gdp price index",

    # Low-value / Clutter events explicitly requested for removal
    "jobless claims 4-week", "4-week avg jobless", "4-week average jobless",
    "continuing jobless claims",
    "core pce prices q/q", "pce prices q/q",
    "average weekly earnings",
    "industrial production",
    "balance of trade",
    "retail sales yoy", "retail sales y/y",
    "harmonised inflation", "harmonized inflation", "hicp",
    "ppi yoy", "ppi y/y",

    # Miscellaneous low-value
    "tourist arrivals", "car production", "vehicle production",
    "real consumer spending qoq", "real personal spending",
    "gdp sales", "gross fixed capital",
    "capacity utilization",
)

# Exact lowercase title matches to drop
_NOISE_EXACT_TITLES: frozenset[str] = frozenset({
    "building permits",
    "import prices",
    "export prices",
    "tourist arrivals",
    "car production yoy",
    "balance of trade",
    "continuing jobless claims",
})


def _is_noise_event(title: str) -> bool:
    """Return True if this event is noise and should be discarded."""
    t = title.lower()
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
}


def _format_title_forex_factory_style(title: str, country: str = "") -> str:
    """Transform TradingView raw titles into standard Forex Factory style names."""
    if title in _EXACT_TITLE_MAP:
        return _EXACT_TITLE_MAP[title]

    t = title
    adj = _COUNTRY_ADJECTIVES.get(country, "")

    # 1. Household Consumption -> French Consumer Spending m/m, etc.
    if "Household Consumption" in t:
        period = "m/m" if ("MoM" in t or "m/m" in t) else ("y/y" if ("YoY" in t or "y/y" in t) else "")
        return f"{adj} Consumer Spending {period}".strip() if adj else f"Consumer Spending {period}".strip()

    # 2. Country-specific Flash / Advance / Prelim GDP
    if "GDP" in t:
        if "Flash" in t:
            if "QoQ" in t or "q/q" in t:
                return f"{adj} Flash GDP q/q" if adj else "Flash GDP q/q"
            if "YoY" in t or "y/y" in t:
                return f"{adj} Flash GDP y/y" if adj else "Flash GDP y/y"
        if "Adv" in t or "Advance" in t:
            if "QoQ" in t or "q/q" in t:
                return "Advance GDP q/q" if (country in ("United States", "US")) else (f"{adj} Advance GDP q/q" if adj else "Advance GDP q/q")
            if "YoY" in t or "y/y" in t:
                return "Advance GDP y/y" if (country in ("United States", "US")) else (f"{adj} Advance GDP y/y" if adj else "Advance GDP y/y")
        if "Prel" in t or "Preliminary" in t:
            if "QoQ" in t or "q/q" in t:
                return f"{adj} Prelim GDP q/q" if adj else "Prelim GDP q/q"
            if "YoY" in t or "y/y" in t:
                return f"{adj} Prelim GDP y/y" if adj else "Prelim GDP y/y"

    # 3. Country-specific Prelim CPI / Inflation
    if "Inflation Rate" in t or "CPI" in t:
        if "Prel" in t or "Preliminary" in t:
            period = "y/y" if ("YoY" in t or "y/y" in t) else ("m/m" if ("MoM" in t or "m/m" in t) else "")
            return f"{adj} Prelim CPI {period}".strip() if adj else f"Prelim CPI {period}".strip()

    # 4. Country-prefixed Unemployment Rate for non-US
    if t.strip() == "Unemployment Rate" and adj and country not in ("United States", "US"):
        return f"{adj} Unemployment Rate"

    # 5. Standard Forex Factory format conversions
    t = re.sub(r"\bGDP Growth Rate\b", "GDP", t)
    t = re.sub(r"\bMoM\b", "m/m", t)
    t = re.sub(r"\bYoY\b", "y/y", t)
    t = re.sub(r"\bQoQ\b", "q/q", t)
    t = re.sub(r"\bSpeech\b", "Speaks", t)
    t = re.sub(r"\bAdv\b", "Advance", t)
    t = re.sub(r"\bPrel\b", "Prelim", t)

    # Clean up whitespace
    return re.sub(r"\s+", " ", t).strip()


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
        """
        dtos: List[NormalizedEventDTO] = []

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
                source: str = item.get("source") or "TradingView"

                # Drop noisy / low-value events (regional CPI, bond auctions, etc.)
                if _is_noise_event(raw_title):
                    continue

                title: str = _format_title_forex_factory_style(raw_title, country=country)

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
