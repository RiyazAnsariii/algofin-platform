"""truncate_economic_events_for_holiday_removal_resync

Truncates economic_events so the cold-start sync immediately repopulates without:
- Swiss National Day
- National Days, Bank Holidays, Public Holidays, Independence Days, Day Off events

Revision ID: a0b1c2d3e4f5
Revises: f7a8b9c0d1e2
Create Date: 2026-07-25 20:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'a0b1c2d3e4f5'
down_revision: Union[str, None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates without national days or bank holidays
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
