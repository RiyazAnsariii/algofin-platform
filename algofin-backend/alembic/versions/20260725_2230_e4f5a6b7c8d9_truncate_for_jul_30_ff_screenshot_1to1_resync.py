"""truncate_economic_events_for_jul_30_ff_screenshot_1to1_resync

Truncates economic_events so the cold-start sync immediately repopulates with 1:1 Forex Factory Jul 30 screenshot rules:
- Red 🔴: FOMC Press Conference, BOE Monetary Policy Report, Monetary Policy Summary, MPC Official Bank Rate Votes, Official Bank Rate, Advance GDP q/q, Core PCE Price Index m/m
- Orange 🟠: German Prelim CPI m/m, German Prelim GDP q/q, Advance GDP Price Index q/q, Unemployment Claims
- Yellow 🟡: RBA Assist Gov Hunter Speaks, ANZ Business Confidence, Building Approvals m/m, Import Prices q/q, Consumer Confidence (JPY), French Consumer Spending m/m, French Flash GDP q/q, French Prelim Private Payrolls q/q, KOF Economic Barometer, Spanish Flash CPI y/y, Spanish Flash GDP q/q, Italian Prelim GDP q/q, Italian Monthly Unemployment Rate, Prelim Flash GDP q/q, Unemployment Rate, Italian 10-y Bond Auction, Personal Income m/m, Personal Spending m/m, Natural Gas Storage

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-07-25 22:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = '223344556677'
down_revision: Union[str, None] = '112233445566'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with 1:1 Forex Factory Jul 30 screenshot impact colors & titles
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
