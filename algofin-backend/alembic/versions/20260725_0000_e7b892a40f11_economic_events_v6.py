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
    # 1. Enable pg_trgm extension for PostgreSQL trigram search
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")

    # 2. Create economic_events table if not existing
    op.create_table(
        'economic_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
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
        sa.Column('last_updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('source', 'provider_event_id', name='uq_economic_events_source_provider_id'),
        sa.UniqueConstraint('source', 'event_hash', name='uq_economic_events_source_hash'),
    )

    op.create_index('ix_economic_events_source', 'economic_events', ['source'])
    op.create_index('ix_economic_events_provider_event_id', 'economic_events', ['provider_event_id'])
    op.create_index('ix_economic_events_event_hash', 'economic_events', ['event_hash'])
    op.create_index('ix_economic_events_title', 'economic_events', ['title'])
    op.create_index('ix_economic_events_country', 'economic_events', ['country'])
    op.create_index('ix_economic_events_currency', 'economic_events', ['currency'])
    op.create_index('ix_economic_events_impact', 'economic_events', ['impact'])
    op.create_index('ix_economic_events_event_time_utc', 'economic_events', ['event_time_utc'])

    op.create_index(
        'idx_econ_events_time_impact_curr',
        'economic_events',
        ['event_time_utc', 'impact', 'currency']
    )

    # 3. Create trigram GIN indexes on PostgreSQL
    if conn.dialect.name == "postgresql":
        op.execute("CREATE INDEX IF NOT EXISTS idx_economic_events_trgm_title ON economic_events USING gin (title gin_trgm_ops);")
        op.execute("CREATE INDEX IF NOT EXISTS idx_economic_events_trgm_country ON economic_events USING gin (country gin_trgm_ops);")


def downgrade() -> None:
    op.drop_table('economic_events')
