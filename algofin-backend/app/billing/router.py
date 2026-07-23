# app/billing/router.py
# AlgoFin v1 — Billing endpoints
# GET /billing/periods/current
# GET /billing/periods         (history)
#
# UI wording rules (plan.md Section 5-A — hard):
#   CORRECT: "Estimated monthly fee", "AlgoFin billing estimate", "Current billing summary"
#   NEVER:   "Performance fee", "Invoice", "Amount due"
#
# Shadow billing mode (plan.md Section 9):
#   Fees are calculated and displayed for transparency — NOT collected.
#   No payment integration in v1.


from fastapi import APIRouter

from app.billing.service import get_or_create_current_period, list_period_history
from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/periods/current", response_model=SuccessResponse[dict])
async def current_period(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """
    Current billing period estimate.
    Response field names per plan.md Section 9 contract (locked):
      total_realized_pnl, performance_fee_rate, performance_fee_amount, status
    UI label: "Estimated monthly fee" — never "Invoice" or "Performance fee".
    """
    period = await get_or_create_current_period(db, user_id=str(current_user.id))
    return SuccessResponse(
        data={
            "id": str(period.id),
            "period_start": period.period_start.isoformat(),
            "period_end": period.period_end.isoformat(),
            # Locked field names (plan.md Section 9)
            "total_realized_pnl": float(period.total_realized_pnl),
            "performance_fee_rate": float(period.performance_fee_rate),
            "performance_fee_amount": float(period.performance_fee_amount),
            "status": period.status,
            "notes": period.notes,
        }
    )


@router.get("/periods", response_model=SuccessResponse[list[dict]])
async def period_history(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[list[dict]]:
    """List all billing periods for the current user."""
    periods = await list_period_history(db, user_id=str(current_user.id))
    return SuccessResponse(
        data=[
            {
                "id": str(p.id),
                "period_start": p.period_start.isoformat(),
                "period_end": p.period_end.isoformat(),
                "total_realized_pnl": float(p.total_realized_pnl),
                "performance_fee_rate": float(p.performance_fee_rate),
                "performance_fee_amount": float(p.performance_fee_amount),
                "status": p.status,
                "notes": p.notes,
            }
            for p in periods
        ]
    )
