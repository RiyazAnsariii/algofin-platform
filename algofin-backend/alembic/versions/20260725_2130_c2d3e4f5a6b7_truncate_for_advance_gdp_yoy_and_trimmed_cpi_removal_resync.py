"""truncate_economic_events_for_advance_gdp_yoy_and_trimmed_cpi_removal_resync

Truncates economic_events so the cold-start sync immediately repopulates without:
- Advance GDP y/y (permanently removed across all dates)
- Generic Trimmed Mean CPI & Trimmed Mean CPI y/y (permanently removed across all dates; keeping only Trimmed Mean CPI m/m / q/q)
- AUD CPI title formatting matching Forex Factory exactly

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-07-25 21:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with permanent Advance GDP y/y & Trimmed Mean CPI y/y removals
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
