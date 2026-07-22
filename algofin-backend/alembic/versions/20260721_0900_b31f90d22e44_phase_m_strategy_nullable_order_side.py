"""phase_m_strategy_nullable_order_side

Makes strategies.order_side and strategies.quantity nullable for
pine_webhook strategy type (where side and qty come from the signal).

Uses batch_alter_table to rebuild the table (required for SQLite).

Revision ID: b31f90d22e44
Revises: a76ca8c8ef7b
Create Date: 2026-07-21 09:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'b31f90d22e44'
down_revision: Union[str, None] = 'a76ca8c8ef7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Make order_side and quantity nullable on strategies table.
    Also sets a default of 'MARKET' on order_type so existing rows stay valid.
    SQLite requires batch_alter_table to drop NOT NULL constraints.
    """
    with op.batch_alter_table('strategies', schema=None) as batch_op:
        batch_op.alter_column(
            'order_side',
            existing_type=sa.String(length=10),
            nullable=True,
        )
        batch_op.alter_column(
            'quantity',
            existing_type=sa.Numeric(precision=20, scale=8),
            nullable=True,
        )
        batch_op.alter_column(
            'order_type',
            existing_type=sa.String(length=20),
            nullable=False,
            existing_server_default=None,
            server_default='MARKET',
        )


def downgrade() -> None:
    """Restore NOT NULL constraints (WARNING: will fail if any rows have NULL)."""
    with op.batch_alter_table('strategies', schema=None) as batch_op:
        batch_op.alter_column(
            'order_side',
            existing_type=sa.String(length=10),
            nullable=False,
        )
        batch_op.alter_column(
            'quantity',
            existing_type=sa.Numeric(precision=20, scale=8),
            nullable=False,
        )
