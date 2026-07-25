"""truncate_economic_events_for_same_time_deduplication_resync

Truncates economic_events so the cold-start sync immediately repopulates without any same-time duplicate events:
- Database-level upsert deduplication by (title, currency, event_time_utc)
- Read-path deduplication in get_filtered_events ensuring zero duplicate events at the same time across all dates.

Revision ID: 889900112233
Revises: 778899001122
Create Date: 2026-07-25 23:59:59.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = '889900112233'
down_revision: Union[str, None] = '778899001122'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with same-time deduplication across all dates
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
