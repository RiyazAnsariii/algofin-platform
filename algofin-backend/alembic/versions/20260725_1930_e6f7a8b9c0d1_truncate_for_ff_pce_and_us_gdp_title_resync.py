"""truncate_economic_events_for_ff_pce_and_us_gdp_title_resync

Truncates economic_events so the cold-start sync immediately repopulates with:
- US Advance GDP q/q -> Advance GDP q/q (no US prefix, matching Forex Factory)
- Japan Consumer Confidence -> Consumer Confidence (no JPY prefix)
- Preserved separate indicators: Core PCE Price Index (m/m & y/y) AND PCE Price Index (m/m & y/y)
- Removed: Export Prices q/q, Balance of Trade

Revision ID: e6f7a8b9c0d1
Revises: c4d5e6f7a8b9
Create Date: 2026-07-25 19:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with exact Forex Factory title rules
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
