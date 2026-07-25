"""truncate_economic_events_for_noise_filter_resync

Wipes economic_events so the cold-start TradingView sync immediately
repopulates with the noise filter applied:
- Only 8 major forex currencies (AUD/CAD/CHF/CNY/EUR/GBP/JPY/NZD/USD)
- No regional CPI, bond auctions, housing noise, sentiment clutter,
  GDP revisions (Prel/Final), or misc low-value events.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-25 12:45:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so the cold-start sync re-populates with clean data
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
