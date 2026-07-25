"""truncate_economic_events_for_ff_renames_and_boc_survey_removal

Truncates economic_events so the cold-start sync immediately repopulates with:
- Renamed: Durable Goods Orders Ex Transp m/m -> Core Durable Goods Orders m/m
- Renamed: CBI Distributive Trades -> CBI Realized Sales
- Renamed: Loans to Households y/y -> Private Loans y/y
- Renamed: Loans to Companies y/y -> Corporate Loans y/y
- Removed: BoC Market Participants Survey

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-07-25 15:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with clean Forex Factory renames & BoC survey removal
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
