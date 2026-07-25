# app/providers/fmp_provider.py
# AlgoFin v1 — Financial Modeling Prep (FMP) Economic Calendar Provider

import asyncio
import hashlib
import logging
from datetime import date, datetime, timezone
from typing import List, Tuple, Optional

import httpx

from app.config import settings
from app.providers.base import BaseEconomicCalendarProvider, NormalizedEventDTO
from app.events.blacklist import is_event_blacklisted

logger = logging.getLogger(__name__)


class FMPProvider(BaseEconomicCalendarProvider):
    """
    Financial Modeling Prep (FMP) Economic Calendar API provider implementation.
    API endpoint: GET /api/v3/economic_calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&apikey=...
    """

    provider_name: str = "FMP"
    provider_version: str = "v3"

    TRANSIENT_STATUS_CODES = {500, 502, 503, 504}
    MAX_RETRIES = 3

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or settings.fmp_api_key
        self.base_url = (base_url or settings.fmp_base_url).rstrip("/")
        self.connect_timeout = settings.fmp_connect_timeout_seconds
        self.read_timeout = settings.fmp_read_timeout_seconds

    async def fetch_events(
        self, from_date: date, to_date: date
    ) -> Tuple[List[NormalizedEventDTO], int]:
        """
        Fetch economic events from FMP API with selective transient retry policy.
        """
        url = f"{self.base_url}/economic_calendar"
        params = {
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
            "apikey": self.api_key,
        }

        timeout = httpx.Timeout(self.read_timeout, connect=self.connect_timeout)
        last_exception: Optional[Exception] = None
        last_status_code: int = 500

        for attempt in range(self.MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.get(url, params=params)
                    last_status_code = response.status_code

                    # If status is non-retriable 4xx (401, 403, 404), fail fast or fallback
                    if response.status_code in (401, 403):
                        logger.warning(
                            f"[FMPProvider] FMP plan tier restriction ({response.status_code}). Falling back to MacroCalendarProvider."
                        )
                        from app.providers.macro_calendar_provider import MacroCalendarProvider
                        macro_prov = MacroCalendarProvider()
                        return await macro_prov.fetch_events(from_date, to_date)

                    if 400 <= response.status_code < 500:
                        logger.warning(
                            f"[FMPProvider] Client error {response.status_code} on attempt {attempt+1}. Not retrying."
                        )
                        response.raise_for_status()

                    # If 5xx transient error, raise to trigger retry loop
                    if response.status_code in self.TRANSIENT_STATUS_CODES:
                        raise httpx.HTTPStatusError(
                            f"Server error {response.status_code}",
                            request=response.request,
                            response=response,
                        )

                    response.raise_for_status()
                    data = response.json()

                    if not isinstance(data, list):
                        logger.warning(
                            f"[FMPProvider] Unexpected payload type: {type(data)}. Expected list."
                        )
                        return [], response.status_code

                    normalized = [
                        self._normalize_item(item)
                        for item in data
                        if isinstance(item, dict)
                    ]
                    normalized = [
                        dto for dto in normalized
                        if not is_event_blacklisted(dto.title, dto.currency)
                    ]
                    return normalized, response.status_code

            except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as exc:
                last_exception = exc
                is_status_error = isinstance(exc, httpx.HTTPStatusError)

                # Check if it's a 4xx error (should not retry)
                if is_status_error and exc.response.status_code < 500:
                    raise exc

                if attempt < self.MAX_RETRIES - 1:
                    backoff = 2.0 ** attempt
                    logger.info(
                        f"[FMPProvider] Transient failure ({exc}) on attempt {attempt+1}/{self.MAX_RETRIES}. Retrying in {backoff}s..."
                    )
                    await asyncio.sleep(backoff)
                else:
                    logger.error(
                        f"[FMPProvider] Exhausted retries ({self.MAX_RETRIES}) fetching calendar data: {exc}"
                    )
                    raise exc
            except Exception as exc:
                logger.error(f"[FMPProvider] Non-retriable error: {exc}")
                raise exc

        if last_exception:
            raise last_exception
        return [], last_status_code

    def _normalize_item(self, item: dict) -> NormalizedEventDTO:
        """
        Normalize raw FMP JSON event object into NormalizedEventDTO.
        """
        title = (item.get("event") or item.get("title") or "Economic Event").strip()
        country = (item.get("country") or "Global").strip()
        currency = (item.get("currency") or "USD").strip().upper()

        raw_impact = str(item.get("impact") or "low").strip().lower()
        if "high" in raw_impact:
            impact = "High"
        elif "med" in raw_impact:
            impact = "Medium"
        else:
            impact = "Low"

        # Parse release timestamp
        raw_date = item.get("date") or item.get("event_time")
        event_dt_utc = self._parse_datetime_utc(raw_date)

        # Provider event ID
        provider_id = item.get("id") or item.get("event_id")
        provider_event_id_str = str(provider_id).strip() if provider_id is not None else None

        # Fallback SHA256 signature
        date_iso = event_dt_utc.isoformat()
        hash_input = f"{self.provider_name}|{title}|{currency}|{country}|{date_iso}".encode("utf-8")
        event_hash = hashlib.sha256(hash_input).hexdigest()

        actual = self._clean_str_val(item.get("actual"))
        forecast = self._clean_str_val(item.get("estimate") or item.get("forecast"))
        previous = self._clean_str_val(item.get("previous"))

        return NormalizedEventDTO(
            provider_event_id=provider_event_id_str,
            event_hash=event_hash,
            title=title,
            country=country,
            currency=currency,
            impact=impact,
            event_time_utc=event_dt_utc,
            actual=actual,
            forecast=forecast,
            previous=previous,
            source=self.provider_name,
            raw_payload=item,
        )

    def _clean_str_val(self, val: str | float | int | None) -> Optional[str]:
        if val is None or val == "":
            return None
        return str(val).strip()

    def _parse_datetime_utc(self, raw_date: str | None) -> datetime:
        if not raw_date:
            return datetime.now(timezone.utc)
        try:
            # Format: "2026-07-25 14:30:00" or ISO format
            cleaned = str(raw_date).replace("Z", "+00:00")
            dt = datetime.fromisoformat(cleaned)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                dt = dt.astimezone(timezone.utc)
            return dt
        except Exception:
            return datetime.now(timezone.utc)
