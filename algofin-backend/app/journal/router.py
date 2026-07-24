# app/journal/router.py
# AlgoFin v2 — Phase G: Journal & Analytics REST API

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import select, desc

from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse
from app.journal.schemas import (
    JournalAnalyticsResponse,
    JournalEntryCreate,
    JournalEntryResponse,
    JournalEntryUpdate,
)
from app.journal.service import get_journal_analytics, generate_journal_csv
from app.models.journal import JournalEntry

router = APIRouter(prefix="/journal", tags=["journal"])


# ── Journal CRUD ───────────────────────────────────────────────────────────


@router.get("/entries", response_model=SuccessResponse[list[JournalEntryResponse]])
async def list_entries(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = 50,
    offset: int = 0,
    from_date: str | None = None,
    to_date: str | None = None,
) -> SuccessResponse:
    q = select(JournalEntry).where(JournalEntry.user_id == str(current_user.id))
    if from_date:
        q = q.where(JournalEntry.entry_date >= from_date)
    if to_date:
        q = q.where(JournalEntry.entry_date <= to_date)
    q = q.order_by(desc(JournalEntry.entry_date)).limit(min(limit, 200)).offset(offset)
    result = await db.execute(q)
    entries = result.scalars().all()
    return SuccessResponse(data=[JournalEntryResponse.from_orm_obj(e) for e in entries])


@router.post(
    "/entries", response_model=SuccessResponse[JournalEntryResponse], status_code=201
)
async def create_entry(
    body: JournalEntryCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    entry = JournalEntry(
        user_id=str(current_user.id),
        entry_date=body.entry_date,
        title=body.title,
        body=body.body,
        symbol=body.symbol,
        tags=",".join(body.tags) if body.tags else None,
        mood=body.mood,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return SuccessResponse(data=JournalEntryResponse.from_orm_obj(entry))


@router.get("/entries/{entry_id}", response_model=SuccessResponse[JournalEntryResponse])
async def get_entry(
    entry_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == str(current_user.id),
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return SuccessResponse(data=JournalEntryResponse.from_orm_obj(entry))


@router.patch(
    "/entries/{entry_id}", response_model=SuccessResponse[JournalEntryResponse]
)
async def update_entry(
    entry_id: str,
    body: JournalEntryUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == str(current_user.id),
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")

    if body.title is not None:
        entry.title = body.title.strip()
    if body.body is not None:
        entry.body = body.body
    if body.symbol is not None:
        entry.symbol = body.symbol.upper().strip()
    if body.tags is not None:
        entry.tags = ",".join(body.tags)
    if body.mood is not None:
        entry.mood = body.mood

    await db.commit()
    await db.refresh(entry)
    return SuccessResponse(data=JournalEntryResponse.from_orm_obj(entry))


@router.delete("/entries/{entry_id}", response_model=SuccessResponse[dict])
async def delete_entry(
    entry_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == str(current_user.id),
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    await db.delete(entry)
    await db.commit()
    return SuccessResponse(data={"deleted": True})


# ── Journal Analytics & Export ─────────────────────────────────────────────


@router.get("/analytics", response_model=SuccessResponse[JournalAnalyticsResponse])
async def get_analytics(
    current_user: CurrentUser,
    db: DbSession,
    period: str | None = Query(default="30D", description="7D | 30D | 90D | 1Y | ALL"),
    start_date: str | None = Query(default=None, description="Custom start date (ISO string/date)"),
    end_date: str | None = Query(default=None, description="Custom end date (ISO string/date)"),
    days: int | None = Query(default=None, ge=1, le=9999),
) -> SuccessResponse:
    """
    Compute performance analytics for the given period or custom date range.
    Uses SQL aggregation queries over Binance Futures closed trades.
    """
    analytics = await get_journal_analytics(
        db=db,
        user_id=str(current_user.id),
        period=period,
        start_date=start_date,
        end_date=end_date,
        days=days,
    )
    return SuccessResponse(data=analytics)


@router.get("/export")
async def export_journal(
    current_user: CurrentUser,
    db: DbSession,
    period: str | None = Query(default="30D"),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    days: int | None = Query(default=None),
) -> Response:
    """
    Export closed trade history as CSV download.
    """
    csv_content = await generate_journal_csv(
        db=db,
        user_id=str(current_user.id),
        period=period,
        start_date=start_date,
        end_date=end_date,
        days=days,
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="trading_journal.csv"',
        },
    )
