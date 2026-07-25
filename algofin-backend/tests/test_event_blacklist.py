# tests/test_event_blacklist.py
# Unit tests for economic event blacklisting

import pytest
from app.events.blacklist import is_event_blacklisted


def test_blacklisted_events_matching():
    # 1. Export Prices q/q
    assert is_event_blacklisted("Export Prices q/q") is True

    # 2. GDP y/y variants
    assert is_event_blacklisted("GDP y/y (EU, 10:30)") is True
    assert is_event_blacklisted("Flash GDP y/y (11:30)") is True
    assert is_event_blacklisted("German Flash GDP y/y") is True
    assert is_event_blacklisted("Italian Advance GDP y/y") is True
    assert is_event_blacklisted("Eurozone Flash GDP y/y") is True

    # 3. Spanish releases
    assert is_event_blacklisted("Spanish Prelim CPI m/m") is True
    assert is_event_blacklisted("Spanish Prelim Core CPI y/y") is True
    assert is_event_blacklisted("Spanish Flash GDP y/y") is True

    # 4. EUR PPI m/m & Consumer Confidence & Retail Sales m/m
    assert is_event_blacklisted("PPI m/m", "EUR") is True
    assert is_event_blacklisted("Consumer Confidence", "EUR") is True
    assert is_event_blacklisted("Retail Sales m/m", "EUR") is True

    # 5. Italian Unemployment Rate
    assert is_event_blacklisted("Italian Unemployment Rate") is True

    # 6. BoE MPC Votes
    assert is_event_blacklisted("BoE MPC Vote Unchanged") is True
    assert is_event_blacklisted("BoE MPC Vote Hike") is True
    assert is_event_blacklisted("BoE MPC Vote Cut") is True

    # 7. Non-standard PCE releases
    assert is_event_blacklisted("Core PCE Prices q/q Advance") is True
    assert is_event_blacklisted("Core PCE Price Index y/y") is True
    assert is_event_blacklisted("PCE Prices q/q Advance") is True
    assert is_event_blacklisted("PCE Price Index m/m") is True
    assert is_event_blacklisted("PCE Price Index y/y") is True

    # 8. Speaker & Energy releases
    assert is_event_blacklisted("BOE Gov Bailey Speaks") is True
    assert is_event_blacklisted("EIA Natural Gas Stocks Change") is True


def test_valid_forexfactory_events_not_blacklisted():
    # Genuine ForexFactory events must NOT be blacklisted
    assert is_event_blacklisted("President Trump Speaks") is False
    assert is_event_blacklisted("US Core CPI m/m", "USD") is False
    assert is_event_blacklisted("US Consumer Price Index (CPI) y/y", "USD") is False
    assert is_event_blacklisted("Fed Interest Rate Decision") is False
    assert is_event_blacklisted("Flash Manufacturing PMI") is False
    assert is_event_blacklisted("Flash Services PMI") is False
    assert is_event_blacklisted("New Home Sales") is False
    assert is_event_blacklisted("Treasury Currency Report") is False
    assert is_event_blacklisted("German Flash Manufacturing PMI") is False
    assert is_event_blacklisted("ECB Monetary Policy Statement") is False
    assert is_event_blacklisted("BOE Inflation Report") is False
    assert is_event_blacklisted("BOJ Policy Rate") is False
    assert is_event_blacklisted("Unemployment Claims") is False
    assert is_event_blacklisted("Core PCE Price Index m/m", "USD") is False
