"""truncate_economic_events_for_forex_factory_country_titles_resync

Truncates economic_events so the cold-start TradingView sync immediately
repopulates with:
- Country-specific Forex Factory titles (e.g. French Flash GDP q/q, German Prelim CPI y/y, Italian Unemployment Rate)
- Specific speaker names (e.g. RBA Assist Gov Hunter Speaks, BOE Gov Bailey Speaks)
- Removal of low-value noise events (Jobless Claims 4-week Average, Continuing Jobless Claims,
  Core PCE Prices q/q, PCE Prices q/q, GDP Price Index q/q, Average Weekly Earnings y/y,
  Industrial Production, Balance of Trade, Retail Sales y/y, duplicate Harmonised inflation, PPI y/y).

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-07-25 13:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with country-aware Forex Factory titles & clean filters
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
