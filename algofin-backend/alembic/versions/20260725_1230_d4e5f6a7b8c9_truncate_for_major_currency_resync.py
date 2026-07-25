"""truncate_economic_events_for_major_currency_resync

Truncates the economic_events table so the cold-start TradingView sync
immediately repopulates with only the 8 major forex currencies
(AUD, CAD, CHF, CNY, EUR, GBP, JPY, NZD, USD).

Revision ID: d4e5f6a7b8c9
Revises: c1d2e3f4a5b6
Create Date: 2026-07-25 12:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Wipe all events so the cold-start sync re-populates
    # with only the 8 major forex currencies (provider filter now active)
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass  # Data-only migration — no structural downgrade needed
