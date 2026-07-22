"""phase_m_strategy_pine_webhook_columns

Adds 4 new columns to the strategies table for pine_webhook support:
  - pine_code      TEXT    nullable  — stores latest Pine Script code (display only)
  - timeframe      VARCHAR nullable  — e.g. "1h", "4h", "1D"
  - current_version INTEGER NOT NULL — version counter (bumped on each pine save)
  - is_test_mode   BOOLEAN NOT NULL  — if True, signals logged but never executed

NOTE: Uses ADD COLUMN IF NOT EXISTS (PostgreSQL 9.6+) so that the migration is
idempotent — safe to run even if a prior partial deployment already added these columns.

Revision ID: a76ca8c8ef7b
Revises: dd4e6834c773
Create Date: 2026-07-21 10:52:12.099326

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a76ca8c8ef7b'
down_revision: Union[str, None] = 'dd4e6834c773'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add Phase M pine_webhook columns to strategies table.
    Uses raw SQL ADD COLUMN IF NOT EXISTS so this is idempotent on PostgreSQL.
    A prior partial deploy cannot cause DuplicateColumnError.
    """
    op.execute("ALTER TABLE strategies ADD COLUMN IF NOT EXISTS pine_code TEXT")
    op.execute("ALTER TABLE strategies ADD COLUMN IF NOT EXISTS timeframe VARCHAR(10)")
    op.execute("ALTER TABLE strategies ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE strategies ADD COLUMN IF NOT EXISTS is_test_mode BOOLEAN NOT NULL DEFAULT FALSE")


def downgrade() -> None:
    """Remove the 4 Phase M columns from strategies table."""
    op.execute("ALTER TABLE strategies DROP COLUMN IF EXISTS is_test_mode")
    op.execute("ALTER TABLE strategies DROP COLUMN IF EXISTS current_version")
    op.execute("ALTER TABLE strategies DROP COLUMN IF EXISTS timeframe")
    op.execute("ALTER TABLE strategies DROP COLUMN IF EXISTS pine_code")
