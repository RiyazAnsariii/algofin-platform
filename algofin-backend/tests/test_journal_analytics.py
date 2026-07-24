# tests/test_journal_analytics.py
# AlgoFin — Unit tests for Journal Analytics API & CSV Export

import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.exchange import UserExchangeAccount
from app.models.trading import Trade
from app.common.security import create_access_token


@pytest.mark.asyncio
async def test_analytics_no_trades(client: AsyncClient, db: AsyncSession):
    """Test analytics when user has no trades or connected accounts."""
    # Create test user
    user = User(
        id=uuid.uuid4(),
        email="notrades@example.com",
        hashed_password="dummy_hash",
        full_name="No Trades User",
    )
    db.add(user)
    await db.commit()

    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/v1/journal/analytics", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]

    # Check required fields
    summary = data["summary"]
    assert summary["total_trades"] == 0
    assert summary["win_rate"] == 0.0
    assert summary["profit_factor"] == 0.0
    assert summary["net_pnl"] == 0.0
    assert summary["avg_win"] == 0.0
    assert summary["avg_loss"] == 0.0
    assert summary["best_day"] == 0.0
    assert summary["worst_day"] == 0.0

    assert data["cumulative_pnl"] == []
    assert data["win_loss_ratio"]["wins"] == 0
    assert data["win_loss_ratio"]["losses"] == 0
    assert data["win_loss_ratio"]["win_percent"] == 0.0
    assert data["win_loss_ratio"]["loss_percent"] == 0.0
    assert data["trade_performance"] == []
    assert len(data["pnl_distribution"]) == 6


@pytest.mark.asyncio
async def test_analytics_only_winning_trades(client: AsyncClient, db: AsyncSession):
    """Test analytics when user has only winning trades (profit factor divide-by-zero safety)."""
    user = User(id=uuid.uuid4(), email="winsonly@example.com", hashed_password="pw", full_name="Wins Only")
    account = UserExchangeAccount(
        id=uuid.uuid4(),
        user_id=str(user.id),
        exchange_id="binance_usdtm",
        label="Binance Futures",
        is_active=True,
    )
    db.add_all([user, account])
    await db.commit()

    now = datetime.now(timezone.utc)
    t1 = Trade(
        id=uuid.uuid4(),
        exchange_account_id=account.id,
        binance_trade_id="101",
        order_id="o1",
        symbol="BTCUSDT",
        side="buy",
        price=Decimal("60000"),
        qty=Decimal("0.1"),
        realized_pnl=Decimal("150.00"),
        commission=Decimal("2.00"),
        trade_time=now - timedelta(days=2),
        synced_at=now,
    )
    t2 = Trade(
        id=uuid.uuid4(),
        exchange_account_id=account.id,
        binance_trade_id="102",
        order_id="o2",
        symbol="ETHUSDT",
        side="sell",
        price=Decimal("3000"),
        qty=Decimal("1.0"),
        realized_pnl=Decimal("250.00"),
        commission=Decimal("3.00"),
        trade_time=now - timedelta(days=1),
        synced_at=now,
    )
    db.add_all([t1, t2])
    await db.commit()

    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/v1/journal/analytics?period=7D", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]

    summary = data["summary"]
    assert summary["total_trades"] == 2
    assert summary["win_rate"] == 100.0
    assert summary["profit_factor"] == 0.0  # gross loss is 0 -> profit factor returns 0.0 safely
    assert summary["net_pnl"] == 395.0  # (150-2) + (250-3) = 148 + 247 = 395.0
    assert summary["avg_win"] == 200.0  # (150 + 250) / 2
    assert summary["avg_loss"] == 0.0

    assert data["win_loss_ratio"]["wins"] == 2
    assert data["win_loss_ratio"]["losses"] == 0
    assert data["win_loss_ratio"]["win_percent"] == 100.0


@pytest.mark.asyncio
async def test_analytics_only_losing_trades(client: AsyncClient, db: AsyncSession):
    """Test analytics when user has only losing trades."""
    user = User(id=uuid.uuid4(), email="lossesonly@example.com", hashed_password="pw", full_name="Losses Only")
    account = UserExchangeAccount(
        id=uuid.uuid4(),
        user_id=str(user.id),
        exchange_id="binance_usdtm",
        label="Binance Futures",
        is_active=True,
    )
    db.add_all([user, account])
    await db.commit()

    now = datetime.now(timezone.utc)
    t1 = Trade(
        id=uuid.uuid4(),
        exchange_account_id=account.id,
        binance_trade_id="201",
        order_id="o201",
        symbol="BTCUSDT",
        side="sell",
        price=Decimal("60000"),
        qty=Decimal("0.1"),
        realized_pnl=Decimal("-120.00"),
        commission=Decimal("1.50"),
        trade_time=now - timedelta(days=1),
        synced_at=now,
    )
    db.add(t1)
    await db.commit()

    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/v1/journal/analytics?period=30D", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]

    summary = data["summary"]
    assert summary["total_trades"] == 1
    assert summary["win_rate"] == 0.0
    assert summary["profit_factor"] == 0.0
    assert summary["net_pnl"] == -121.5
    assert summary["avg_win"] == 0.0
    assert summary["avg_loss"] == -120.0

    assert data["win_loss_ratio"]["wins"] == 0
    assert data["win_loss_ratio"]["losses"] == 1
    assert data["win_loss_ratio"]["loss_percent"] == 100.0


@pytest.mark.asyncio
async def test_analytics_mixed_trades(client: AsyncClient, db: AsyncSession):
    """Test analytics with a mixture of winning and losing trades."""
    user = User(id=uuid.uuid4(), email="mixed@example.com", hashed_password="pw", full_name="Mixed Trades User")
    account = UserExchangeAccount(
        id=uuid.uuid4(),
        user_id=str(user.id),
        exchange_id="binance_usdtm",
        label="Binance Futures",
        is_active=True,
    )
    db.add_all([user, account])
    await db.commit()

    now = datetime.now(timezone.utc)
    t1 = Trade(
        id=uuid.uuid4(),
        exchange_account_id=account.id,
        binance_trade_id="301",
        order_id="o301",
        symbol="BTCUSDT",
        side="buy",
        price=Decimal("65000"),
        qty=Decimal("0.1"),
        realized_pnl=Decimal("300.00"),
        commission=Decimal("3.00"),
        trade_time=now - timedelta(days=3),
        synced_at=now,
    )
    t2 = Trade(
        id=uuid.uuid4(),
        exchange_account_id=account.id,
        binance_trade_id="302",
        order_id="o302",
        symbol="ETHUSDT",
        side="sell",
        price=Decimal("3500"),
        qty=Decimal("1.0"),
        realized_pnl=Decimal("-100.00"),
        commission=Decimal("2.00"),
        trade_time=now - timedelta(days=2),
        synced_at=now,
    )
    t3 = Trade(
        id=uuid.uuid4(),
        exchange_account_id=account.id,
        binance_trade_id="303",
        order_id="o303",
        symbol="SOLUSDT",
        side="buy",
        price=Decimal("150"),
        qty=Decimal("10.0"),
        realized_pnl=Decimal("50.00"),
        commission=Decimal("1.00"),
        trade_time=now - timedelta(days=1),
        synced_at=now,
    )
    db.add_all([t1, t2, t3])
    await db.commit()

    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/v1/journal/analytics?period=30D", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]

    summary = data["summary"]
    assert summary["total_trades"] == 3
    assert summary["win_rate"] == 66.67
    assert summary["profit_factor"] == 3.5  # Gross win 350 / Gross loss 100 = 3.5
    assert summary["net_pnl"] == 244.0  # (300-3) + (-100-2) + (50-1) = 297 - 102 + 49 = 244.0

    # Cumulative PnL points
    cum = data["cumulative_pnl"]
    assert len(cum) == 3
    assert cum[0]["running_total"] == 297.0
    assert cum[1]["running_total"] == 195.0
    assert cum[2]["running_total"] == 244.0

    # Trade performance points
    tp = data["trade_performance"]
    assert len(tp) == 3
    assert tp[0]["trade_number"] == 1
    assert tp[0]["realized_pnl"] == 297.0

    # PnL distribution buckets
    dist = {item["range"]: item["count"] for item in data["pnl_distribution"]}
    assert dist[">200"] == 1  # 297
    assert dist["-200~-100"] == 1  # -102
    assert dist["0~100"] == 1  # 49


@pytest.mark.asyncio
async def test_analytics_empty_date_range(client: AsyncClient, db: AsyncSession):
    """Test filtering by date range where no trades occurred."""
    user = User(id=uuid.uuid4(), email="range@example.com", hashed_password="pw", full_name="Range User")
    account = UserExchangeAccount(
        id=uuid.uuid4(),
        user_id=str(user.id),
        exchange_id="binance_usdtm",
        label="Binance Futures",
        is_active=True,
    )
    db.add_all([user, account])
    await db.commit()

    now = datetime.now(timezone.utc)
    t1 = Trade(
        id=uuid.uuid4(),
        exchange_account_id=account.id,
        binance_trade_id="401",
        order_id="o401",
        symbol="BTCUSDT",
        side="buy",
        price=Decimal("60000"),
        qty=Decimal("0.1"),
        realized_pnl=Decimal("100.00"),
        commission=Decimal("1.00"),
        trade_time=now - timedelta(days=10),
        synced_at=now,
    )
    db.add(t1)
    await db.commit()

    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # Query custom date range where no trades exist (e.g., 2020-01-01 to 2020-01-05)
    res = await client.get(
        "/api/v1/journal/analytics?start_date=2020-01-01&end_date=2020-01-05",
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()["data"]

    assert data["summary"]["total_trades"] == 0
    assert data["cumulative_pnl"] == []


@pytest.mark.asyncio
async def test_export_csv_endpoint(client: AsyncClient, db: AsyncSession):
    """Test exporting trade history as CSV download."""
    user = User(id=uuid.uuid4(), email="export@example.com", hashed_password="pw", full_name="Export User")
    account = UserExchangeAccount(
        id=uuid.uuid4(),
        user_id=str(user.id),
        exchange_id="binance_usdtm",
        label="Binance Futures",
        is_active=True,
    )
    db.add_all([user, account])
    await db.commit()

    now = datetime.now(timezone.utc)
    t1 = Trade(
        id=uuid.uuid4(),
        exchange_account_id=account.id,
        binance_trade_id="501",
        order_id="o501",
        symbol="BTCUSDT",
        side="buy",
        price=Decimal("65000.00"),
        qty=Decimal("0.1000"),
        realized_pnl=Decimal("150.00"),
        commission=Decimal("2.50"),
        trade_time=now - timedelta(days=1),
        synced_at=now,
    )
    db.add(t1)
    await db.commit()

    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/v1/journal/export?period=30D", headers=headers)
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert 'filename="trading_journal.csv"' in res.headers["content-disposition"]

    csv_text = res.text
    lines = csv_text.strip().split("\n")
    assert len(lines) == 2
    assert "Close Time,Symbol,Side,Entry Price,Exit Price,Quantity,Realized PnL,Commission,ROI %" in lines[0]
    assert "BTCUSDT" in lines[1]
    assert "BUY" in lines[1]
    assert "150.00" in lines[1]
