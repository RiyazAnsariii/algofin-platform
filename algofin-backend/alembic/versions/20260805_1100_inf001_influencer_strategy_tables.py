# alembic/versions/20260805_1100_inf001_influencer_strategy_tables.py
# Phase INF: Influencer Strategy Engine — initial tables
#
# New tables:
#   influencer_strategies
#   influencer_subscriptions
#   influencer_signals
#   influencer_subscriber_executions

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from app.database import UUIDType

revision = "inf001_influencer"
down_revision = "aabbccdd1122"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── influencer_strategies ─────────────────────────────────────────────────
    op.create_table(
        "influencer_strategies",
        sa.Column("id", UUIDType(), nullable=False),
        sa.Column("strategy_code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("creator_name", sa.String(100), nullable=False),
        sa.Column("creator_avatar_url", sa.String(500), nullable=True),
        sa.Column("supported_markets", sa.JSON(), nullable=True),
        sa.Column("recommended_timeframe", sa.String(10), nullable=True),
        sa.Column("risk_level", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("backtested_return", sa.Numeric(8, 2), nullable=True),
        sa.Column("max_drawdown", sa.Numeric(8, 2), nullable=True),
        sa.Column("win_rate", sa.Numeric(8, 2), nullable=True),
        sa.Column("total_trades", sa.Integer(), nullable=True),
        sa.Column("equity_curve", sa.JSON(), nullable=True),
        sa.Column("pine_code", sa.Text(), nullable=True),
        sa.Column("webhook_secret_hash", sa.String(128), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("version", sa.String(20), nullable=False, server_default="1.0"),
        sa.Column("created_by", UUIDType(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("strategy_code", name="uq_influencer_strategy_code"),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_inf_strategy_created_by",
        ),
    )

    # ── influencer_subscriptions ──────────────────────────────────────────────
    op.create_table(
        "influencer_subscriptions",
        sa.Column("id", UUIDType(), nullable=False),
        sa.Column("user_id", UUIDType(), nullable=False),
        sa.Column("influencer_strategy_id", UUIDType(), nullable=False),
        sa.Column("exchange_account_id", UUIDType(), nullable=False),
        sa.Column("symbol", sa.String(30), nullable=False),
        sa.Column("capital_usdt", sa.Numeric(20, 2), nullable=False),
        sa.Column("leverage", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_inf_sub_user",
        ),
        sa.ForeignKeyConstraint(
            ["influencer_strategy_id"],
            ["influencer_strategies.id"],
            ondelete="CASCADE",
            name="fk_inf_sub_strategy",
        ),
        sa.ForeignKeyConstraint(
            ["exchange_account_id"],
            ["user_exchange_accounts.id"],
            ondelete="CASCADE",
            name="fk_inf_sub_exchange_account",
        ),
        sa.UniqueConstraint(
            "user_id",
            "influencer_strategy_id",
            "exchange_account_id",
            "symbol",
            name="uq_inf_sub_user_strategy_account_symbol",
        ),
    )
    op.create_index(
        "ix_inf_sub_user_id",
        "influencer_subscriptions",
        ["user_id"],
    )
    op.create_index(
        "ix_inf_sub_strategy_id",
        "influencer_subscriptions",
        ["influencer_strategy_id"],
    )
    op.create_index(
        "ix_inf_sub_strategy_status",
        "influencer_subscriptions",
        ["influencer_strategy_id", "status"],
    )

    # ── influencer_signals ────────────────────────────────────────────────────
    op.create_table(
        "influencer_signals",
        sa.Column("id", UUIDType(), nullable=False),
        sa.Column("influencer_strategy_id", UUIDType(), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("ticker", sa.String(30), nullable=False),
        sa.Column("price", sa.Numeric(20, 8), nullable=True),
        sa.Column("tv_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idempotency_key", sa.String(64), nullable=False),
        sa.Column("sender_ip", sa.String(45), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column(
            "execution_mode", sa.String(10), nullable=False, server_default="DRY_RUN"
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="QUEUED"),
        sa.Column(
            "subscriber_count", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_inf_signal_idempotency_key"),
        sa.ForeignKeyConstraint(
            ["influencer_strategy_id"],
            ["influencer_strategies.id"],
            ondelete="CASCADE",
            name="fk_inf_signal_strategy",
        ),
    )
    op.create_index(
        "ix_inf_signal_strategy_received",
        "influencer_signals",
        ["influencer_strategy_id", "received_at"],
    )
    op.create_index(
        "ix_inf_signal_status_received",
        "influencer_signals",
        ["status", "received_at"],
    )

    # ── influencer_subscriber_executions ──────────────────────────────────────
    op.create_table(
        "influencer_subscriber_executions",
        sa.Column("id", UUIDType(), nullable=False),
        sa.Column("signal_id", UUIDType(), nullable=False),
        sa.Column("subscription_id", UUIDType(), nullable=False),
        sa.Column("user_id", UUIDType(), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("symbol", sa.String(30), nullable=False),
        sa.Column("execution_mode", sa.String(10), nullable=False),
        sa.Column("computed_quantity", sa.Numeric(20, 8), nullable=True),
        sa.Column("risk_result", sa.String(10), nullable=True),
        sa.Column("risk_rule_id", UUIDType(), nullable=True),
        sa.Column("order_id", UUIDType(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("execution_latency_ms", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "signal_id",
            "subscription_id",
            name="uq_inf_exec_signal_subscription",
        ),
        sa.ForeignKeyConstraint(
            ["signal_id"],
            ["influencer_signals.id"],
            ondelete="CASCADE",
            name="fk_inf_exec_signal",
        ),
        sa.ForeignKeyConstraint(
            ["subscription_id"],
            ["influencer_subscriptions.id"],
            ondelete="CASCADE",
            name="fk_inf_exec_subscription",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_inf_exec_user",
        ),
    )
    op.create_index(
        "ix_inf_exec_signal_id",
        "influencer_subscriber_executions",
        ["signal_id"],
    )
    op.create_index(
        "ix_inf_exec_subscription_id",
        "influencer_subscriber_executions",
        ["subscription_id"],
    )
    op.create_index(
        "ix_inf_exec_user_created",
        "influencer_subscriber_executions",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_index("ix_inf_exec_user_created", "influencer_subscriber_executions")
    op.drop_index("ix_inf_exec_subscription_id", "influencer_subscriber_executions")
    op.drop_index("ix_inf_exec_signal_id", "influencer_subscriber_executions")
    op.drop_table("influencer_subscriber_executions")

    op.drop_index("ix_inf_signal_status_received", "influencer_signals")
    op.drop_index("ix_inf_signal_strategy_received", "influencer_signals")
    op.drop_table("influencer_signals")

    op.drop_index("ix_inf_sub_strategy_status", "influencer_subscriptions")
    op.drop_index("ix_inf_sub_strategy_id", "influencer_subscriptions")
    op.drop_index("ix_inf_sub_user_id", "influencer_subscriptions")
    op.drop_table("influencer_subscriptions")

    op.drop_table("influencer_strategies")
