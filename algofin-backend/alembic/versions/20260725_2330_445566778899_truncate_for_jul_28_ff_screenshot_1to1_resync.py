"""truncate_economic_events_for_jul_28_ff_screenshot_1to1_resync

Truncates economic_events so the cold-start sync immediately repopulates with 1:1 Forex Factory Jul 28 screenshot rules:
- Red 🔴: RBA Gov Bullock Speaks (AUD)
- Orange 🟠: CB Consumer Confidence (USD)
- Yellow 🟡: BRC Shop Price Index y/y (GBP), BOJ Core CPI y/y (JPY), Spanish Unemployment Rate (EUR), German Buba Monthly Report (EUR), ADP Weekly Employment Change (USD), Goods Trade Balance (USD), Prelim Wholesale Inventories m/m (USD), HPI m/m (USD), S&P/CS Composite-20 HPI y/y (USD), Richmond Manufacturing Index (USD)

Revision ID: 445566778899
Revises: 334455667788
Create Date: 2026-07-25 23:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = '445566778899'
down_revision: Union[str, None] = '334455667788'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with 1:1 Forex Factory Jul 28 screenshot impact colors & titles
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
