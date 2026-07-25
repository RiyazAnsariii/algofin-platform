"""truncate_economic_events_for_jul_28_remaining_noise_purge_resync

Truncates economic_events so the cold-start sync immediately purges all remaining noisy events:
- Permanent removals: Spanish/Italian/Austrian Retail Sales m/m, French Consumer Confidence, Case-Shiller m/m, House Price Index y/y, House Price Index (generic), Redbook y/y, Retail Inventories Ex Autos m/m Advance.

Revision ID: 778899001122
Revises: 667788990011
Create Date: 2026-07-25 23:59:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = '778899001122'
down_revision: Union[str, None] = '667788990011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates without any remaining noisy events
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
