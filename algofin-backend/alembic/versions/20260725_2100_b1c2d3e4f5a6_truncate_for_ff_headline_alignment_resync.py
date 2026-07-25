"""truncate_economic_events_for_ff_headline_alignment_resync

Truncates economic_events so the cold-start sync immediately repopulates with:
- API Weekly Statistical Bulletin (Yellow 🟡)
- BOC Summary of Deliberations (Orange 🟠)
- AUD CPI without country prefix: CPI m/m, CPI y/y, Trimmed Mean CPI m/m
- Permanent removal of Advance GDP y/y, Import Prices y/y, generic AUD CPI duplicates
- Batch deduplication collapsing duplicate sub-series rows per (title, currency, event_time_utc)

Revision ID: b1c2d3e4f5a6
Revises: a0b1c2d3e4f5
Create Date: 2026-07-25 21:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'a0b1c2d3e4f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with headline Forex Factory alignment & batch deduplication
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
