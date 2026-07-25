"""truncate_economic_events_for_jul_29_ff_screenshot_1to1_resync

Truncates economic_events so the cold-start sync immediately repopulates with 1:1 Forex Factory Jul 29 screenshot rules:
- Red 🔴: CPI m/m (AUD), CPI y/y (AUD), Trimmed Mean CPI m/m (AUD), Federal Funds Rate (USD), FOMC Statement (USD)
- Yellow 🟡: API Weekly Statistical Bulletin (USD), German Import Prices m/m (EUR), UBS Economic Expectations (CHF), M4 Money Supply m/m (GBP), Mortgage Approvals (GBP), Net Lending to Individuals m/m (GBP), German 10-y Bond Auction (EUR), Crude Oil Inventories (USD), BOC Summary of Deliberations (CAD)

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-07-25 22:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = '112233445566'
down_revision: Union[str, None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with 1:1 Forex Factory Jul 29 screenshot impact colors & titles
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
