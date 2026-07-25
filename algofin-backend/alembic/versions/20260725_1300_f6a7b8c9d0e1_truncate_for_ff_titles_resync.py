"""truncate_economic_events_for_forex_factory_titles_resync

Truncates economic_events so the cold-start TradingView sync immediately
repopulates with Forex Factory styled title names (e.g. m/m, y/y, q/q, FOMC Press Conference, Speaks).

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-25 13:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with renamed titles
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
