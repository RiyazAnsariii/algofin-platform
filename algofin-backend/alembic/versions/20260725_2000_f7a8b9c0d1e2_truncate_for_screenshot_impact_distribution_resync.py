"""truncate_economic_events_for_screenshot_impact_distribution_resync

Truncates economic_events so the cold-start sync immediately repopulates with:
- 🔴 High: FOMC Press Conference, BOE Monetary Policy Report, Monetary Policy Summary, MPC Official Bank Rate Votes, Official Bank Rate, Advance GDP q/q, Core PCE Price Index m/m
- 🟠 Medium: German Prelim CPI, German Prelim GDP, Advance GDP Price Index q/q, Unemployment Claims / Initial Jobless Claims
- 🟡 Low: RBA Hunter Speaks, ANZ Business Confidence, Building Approvals, Import Prices, Consumer Confidence, French Consumer Spending/GDP, KOF Barometer, Spanish CPI/GDP, Italian GDP/Unemployment, Personal Income/Spending, Natural Gas Storage

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-07-25 20:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with exact screenshot impact classifications
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
