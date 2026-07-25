"""truncate_economic_events_for_oil_fed_eia_mba_resync

Truncates economic_events so the cold-start sync immediately repopulates with:
- Renamed: API Crude Oil Stock Change -> API Weekly Crude Oil Stock
- Renamed: Fed Interest Rate Decision -> Federal Funds Rate
- Renamed: EIA Crude Oil Stocks Change -> Crude Oil Inventories
- Removed: BOJ JGB Purchase, Industrial Sales, UniCredit PMIs, BOT auctions, FRN auctions
- Removed: MBA Data (Purchase Index, Refinance, Market Index, Applications)
- Removed: Niche EIA sub-reports (Gasoline, Distillate, Refinery, Cushing, Heating Oil)
- Kept: Net Lending to Individuals, M4 Money Supply, M3 Money Supply

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-07-25 15:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'e4f5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with clean Forex Factory oil, Fed, and EIA titles & filters
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
