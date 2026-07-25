"""truncate_economic_events_for_jul_27_ff_screenshot_1to1_resync

Truncates economic_events so the cold-start sync immediately repopulates with 1:1 Forex Factory Jul 27 screenshot rules:
- All 8 events on Jul 27 are Yellow 🟡: SPPI y/y (JPY), German ifo Business Climate (EUR), M3 Money Supply y/y (EUR), Private Loans y/y (EUR), ECOFIN Meetings (EUR), CBI Realized Sales (GBP), Core Durable Goods Orders m/m (USD), Durable Goods Orders m/m (USD)

Revision ID: 334455667788
Revises: 223344556677
Create Date: 2026-07-25 23:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = '334455667788'
down_revision: Union[str, None] = '223344556677'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with 1:1 Forex Factory Jul 27 screenshot impact colors & titles
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
