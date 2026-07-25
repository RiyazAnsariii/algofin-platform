"""truncate_economic_events_for_jul_28_noise_purge_resync

Truncates economic_events so the cold-start sync immediately purges all absent noisy events shown in AlgoFin screenshots:
- Permanent removals across all dates: French Consumer Confidence, ATB Auctions, Gilt Tenders, BTP Auctions, Jobseekers Total, Unemployment Benefit Claims, Retail Inventories Ex Autos, Redbook y/y, Case-Shiller m/m, un-suffixed House Price Index / HPI y/y, Richmond Manufacturing Shipments Index, generic Money Supply, country-level Retail Sales m/m.
- Keeps 1:1 12 events matching Forex Factory Jul 28 date sheet: BRC Shop Price Index y/y, RBA Gov Bullock Speaks, BOJ Core CPI y/y, Spanish Unemployment Rate, German Buba Monthly Report, ADP Weekly Employment Change, Goods Trade Balance, Prelim Wholesale Inventories m/m, HPI m/m, S&P/CS Composite-20 HPI y/y, CB Consumer Confidence, Richmond Manufacturing Index.

Revision ID: 667788990011
Revises: 556677889900
Create Date: 2026-07-25 23:55:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = '667788990011'
down_revision: Union[str, None] = '556677889900'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates without any noisy absent events
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
