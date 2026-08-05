"""add user suspension columns

Revision ID: aa11bb22cc33
Revises: inf001_influencer_strategy_tables
Create Date: 2026-08-05 15:00:00.000000

Adds two columns to the `users` table:
  - suspended_until (DateTime, nullable) — temp ban expiry; NULL = not suspended
  - is_permanently_blocked (Boolean, default False) — permanent ban flag
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "aa11bb22cc33"
down_revision = "inf001_influencer_strategy_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "suspended_until",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="If set, user is temporarily suspended until this UTC timestamp",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "is_permanently_blocked",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="Hard permanent block — cannot log in regardless of is_active",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "is_permanently_blocked")
    op.drop_column("users", "suspended_until")
