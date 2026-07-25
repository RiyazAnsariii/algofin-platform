"""fix_economic_events_schema_v7

Drop and recreate economic_events with the correct schema.
Previous migration (e7b892a40f11) was stamped as applied with the
ADD COLUMN version, leaving both old 'event_time' and new 'event_time_utc'
columns in the table. This migration fixes that by doing a clean DROP + CREATE.

Revision ID: c1d2e3f4a5b6
Revises: 5af8240b029d
Create Date: 2026-07-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = '5af8240b029d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    is_pg = conn.dialect.name == "postgresql"

    if is_pg:
        # Drop and recreate cleanly — economic_events is a pure cache table,
        # it holds no user data. TradingView repopulates on every startup.
        op.execute("DROP TABLE IF EXISTS economic_events CASCADE;")
        op.execute("""
            CREATE TABLE economic_events (
                id UUID NOT NULL DEFAULT gen_random_uuid(),
                source VARCHAR(100) NOT NULL DEFAULT 'TradingView',
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
                PRIMARY KEY (id),
                CONSTRAINT uq_economic_events_source_provider_id UNIQUE (source, provider_event_id),
                CONSTRAINT uq_economic_events_source_hash UNIQUE (source, event_hash)
            );
        """)
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
        op.execute("CREATE INDEX ix_economic_events_source ON economic_events (source);")
        op.execute("CREATE INDEX ix_economic_events_provider_event_id ON economic_events (provider_event_id);")
        op.execute("CREATE INDEX ix_economic_events_event_hash ON economic_events (event_hash);")
        op.execute("CREATE INDEX ix_economic_events_title ON economic_events (title);")
        op.execute("CREATE INDEX ix_economic_events_country ON economic_events (country);")
        op.execute("CREATE INDEX ix_economic_events_currency ON economic_events (currency);")
        op.execute("CREATE INDEX ix_economic_events_impact ON economic_events (impact);")
        op.execute("CREATE INDEX ix_economic_events_event_time_utc ON economic_events (event_time_utc);")
        op.execute("CREATE INDEX idx_econ_events_time_impact_curr ON economic_events (event_time_utc, impact, currency);")
        op.execute("CREATE INDEX idx_economic_events_trgm_title ON economic_events USING gin (title gin_trgm_ops);")
        op.execute("CREATE INDEX idx_economic_events_trgm_country ON economic_events USING gin (country gin_trgm_ops);")
    else:
        # SQLite local dev
        op.execute("DROP TABLE IF EXISTS economic_events;")
        op.create_table(
            'economic_events',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('source', sa.String(100), nullable=False, server_default='TradingView'),
            sa.Column('provider_event_id', sa.String(100), nullable=True),
            sa.Column('event_hash', sa.String(64), nullable=False),
            sa.Column('title', sa.String(500), nullable=False),
            sa.Column('country', sa.String(100), nullable=False),
            sa.Column('currency', sa.String(10), nullable=False),
            sa.Column('impact', sa.String(10), nullable=False),
            sa.Column('event_time_utc', sa.DateTime(timezone=True), nullable=False),
            sa.Column('actual', sa.String(100), nullable=True),
            sa.Column('forecast', sa.String(100), nullable=True),
            sa.Column('previous', sa.String(100), nullable=True),
            sa.Column('raw_payload', sa.JSON(), nullable=True),
            sa.Column('revision_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('last_updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        )


def downgrade() -> None:
    op.drop_table('economic_events')
