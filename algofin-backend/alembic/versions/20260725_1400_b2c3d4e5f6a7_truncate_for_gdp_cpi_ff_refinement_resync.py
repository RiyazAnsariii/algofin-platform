"""truncate_economic_events_for_gdp_cpi_ff_refinement_resync

Truncates economic_events so the cold-start sync populates with strictly formatted
Forex Factory GDP & CPI titles:
- 🇫🇷 French Flash GDP q/q / French Flash GDP y/y
- 🇩🇪 German Prelim GDP q/q / German Prelim CPI y/y
- 🇪🇸 Spanish Flash GDP q/q
- 🇮🇹 Italian Prelim GDP q/q
- 🇪🇺 Eurozone Flash GDP q/q
- 🇺🇸 Advance GDP q/q / US Core CPI m/m / US CPI m/m

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-25 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with refined Forex Factory GDP & CPI titles
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
