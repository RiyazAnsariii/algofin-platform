"""truncate_economic_events_for_additional_noise_filter_resync

Truncates economic_events so the cold-start sync immediately repopulates without:
- Bond Auctions (OLO auctions, BTF auctions)
- Banking Statistics (Total Credit y/y)
- Ifo Components (Ifo Current Conditions, Ifo Expectations — keeping headline Ifo Business Climate)
- Leading Indicators (Leading Economic Index, Coincident Index)
- China clutter (Politburo Meeting, Industrial Profits)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-25 14:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with clean, noise-free calendar
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
