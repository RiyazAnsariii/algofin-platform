"""truncate_economic_events_for_durable_goods_and_money_supply_resync

Truncates economic_events so the cold-start sync immediately repopulates with:
- Kept: Durable Goods Orders m/m, Core Durable Goods Orders m/m
- Removed: Non Defense Goods Orders Ex Air, Durable Goods Orders Ex Defense
- Removed optional clutter: M3 Money Supply, Private Loans

Revision ID: d3e4f5a6b7c8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-25 14:45:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with clean Forex Factory durable goods & money supply filters
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
