"""create_economic_events_v6

Revision ID: e7b892a40f11
Revises: a76ca8c8ef7b
Create Date: 2026-07-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e7b892a40f11'
down_revision: Union[str, None] = 'a76ca8c8ef7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    is_pg = conn.dialect.name == "postgresql"

    # 1. Enable pg_trgm extension (idempotent)
    if is_pg:
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")

    # 2. Create table only if it does not exist at all
    if is_pg:
        op.execute("""
            CREATE TABLE IF NOT EXISTS economic_events (
                id UUID NOT NULL DEFAULT gen_random_uuid(),
                source VARCHAR(100) NOT NULL DEFAULT 'FMP',
                provider_event_id VARCHAR(100),
                event_hash VARCHAR(64) NOT NULL DEFAULT '',
                title VARCHAR(500) NOT NULL DEFAULT '',
                country VARCHAR(100) NOT NULL DEFAULT '',
                currency VARCHAR(10) NOT NULL DEFAULT '',
                impact VARCHAR(10) NOT NULL DEFAULT '',
                event_time_utc TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                actual VARCHAR(100),
                forecast VARCHAR(100),
                previous VARCHAR(100),
                raw_payload JSON,
                revision_count INTEGER NOT NULL DEFAULT 0,
                last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                PRIMARY KEY (id)
            );
        """)

        # 3. Add any columns that may be missing in older table versions
        #    ADD COLUMN IF NOT EXISTS is idempotent — safe to run multiple times
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS source VARCHAR(100) NOT NULL DEFAULT 'FMP';")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS provider_event_id VARCHAR(100);")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS event_hash VARCHAR(64) NOT NULL DEFAULT '';")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS title VARCHAR(500) NOT NULL DEFAULT '';")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS country VARCHAR(100) NOT NULL DEFAULT '';")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT '';")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS impact VARCHAR(10) NOT NULL DEFAULT '';")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS event_time_utc TIMESTAMP WITH TIME ZONE;")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS actual VARCHAR(100);")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS forecast VARCHAR(100);")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS previous VARCHAR(100);")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS raw_payload JSON;")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS revision_count INTEGER NOT NULL DEFAULT 0;")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();")
        op.execute("ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();")

        # 4. Add unique constraints if not already present (ignore errors if they exist)
        op.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'uq_economic_events_source_provider_id'
                ) THEN
                    ALTER TABLE economic_events
                    ADD CONSTRAINT uq_economic_events_source_provider_id
                    UNIQUE (source, provider_event_id);
                END IF;
            END $$;
        """)
        op.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'uq_economic_events_source_hash'
                ) THEN
                    ALTER TABLE economic_events
                    ADD CONSTRAINT uq_economic_events_source_hash
                    UNIQUE (source, event_hash);
                END IF;
            END $$;
        """)

        # 5. Create all indexes (IF NOT EXISTS — fully idempotent)
        op.execute("CREATE INDEX IF NOT EXISTS ix_economic_events_source ON economic_events (source);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_economic_events_provider_event_id ON economic_events (provider_event_id);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_economic_events_event_hash ON economic_events (event_hash);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_economic_events_title ON economic_events (title);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_economic_events_country ON economic_events (country);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_economic_events_currency ON economic_events (currency);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_economic_events_impact ON economic_events (impact);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_economic_events_event_time_utc ON economic_events (event_time_utc);")
        op.execute("CREATE INDEX IF NOT EXISTS idx_econ_events_time_impact_curr ON economic_events (event_time_utc, impact, currency);")
        op.execute("CREATE INDEX IF NOT EXISTS idx_economic_events_trgm_title ON economic_events USING gin (title gin_trgm_ops);")
        op.execute("CREATE INDEX IF NOT EXISTS idx_economic_events_trgm_country ON economic_events USING gin (country gin_trgm_ops);")

    else:
        # SQLite fallback (local dev only)
        op.create_table(
            'economic_events',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('source', sa.String(length=100), nullable=False, server_default='FMP'),
            sa.Column('provider_event_id', sa.String(length=100), nullable=True),
            sa.Column('event_hash', sa.String(length=64), nullable=False),
            sa.Column('title', sa.String(length=500), nullable=False),
            sa.Column('country', sa.String(length=100), nullable=False),
            sa.Column('currency', sa.String(length=10), nullable=False),
            sa.Column('impact', sa.String(length=10), nullable=False),
            sa.Column('event_time_utc', sa.DateTime(timezone=True), nullable=False),
            sa.Column('actual', sa.String(length=100), nullable=True),
            sa.Column('forecast', sa.String(length=100), nullable=True),
            sa.Column('previous', sa.String(length=100), nullable=True),
            sa.Column('raw_payload', sa.JSON(), nullable=True),
            sa.Column('revision_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('last_updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        )


def downgrade() -> None:
    op.drop_table('economic_events')
