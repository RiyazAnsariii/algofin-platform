"""phase_m_strategy_nullable_order_side

Makes strategies.order_side and strategies.quantity nullable for
pine_webhook strategy type (where side and qty come from the signal).

Uses raw SQL ALTER COLUMN for PostgreSQL compatibility.

Revision ID: b31f90d22e44
Revises: a76ca8c8ef7b
Create Date: 2026-07-21 09:00:00

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b31f90d22e44'
down_revision: Union[str, None] = 'a76ca8c8ef7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Make order_side and quantity nullable on strategies table.
    Also sets a default of 'MARKET' on order_type so existing rows stay valid.
    Uses raw SQL for PostgreSQL — no batch_alter_table rebuild needed.
    """
    op.execute("ALTER TABLE strategies ALTER COLUMN order_side DROP NOT NULL")
    op.execute("ALTER TABLE strategies ALTER COLUMN quantity DROP NOT NULL")
    op.execute("ALTER TABLE strategies ALTER COLUMN order_type SET DEFAULT 'MARKET'")


def downgrade() -> None:
    """Restore NOT NULL constraints (WARNING: will fail if any rows have NULL values)."""
    op.execute("ALTER TABLE strategies ALTER COLUMN order_side SET NOT NULL")
    op.execute("ALTER TABLE strategies ALTER COLUMN quantity SET NOT NULL")
    op.execute("ALTER TABLE strategies ALTER COLUMN order_type DROP DEFAULT")
