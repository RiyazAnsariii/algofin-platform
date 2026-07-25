"""truncate_economic_events_for_brc_adp_fhfa_trade_resync

Truncates economic_events so the cold-start sync immediately repopulates with:
- Renamed: BRC Shop Price Inflation -> BRC Shop Price Index y/y
- Renamed: ADP Employment Change Weekly -> ADP Employment Change
- Renamed: Goods Trade Balance Advance -> Advance Goods Trade Balance
- Renamed: Wholesale Inventories m/m Advance -> Advance Wholesale Inventories m/m
- Renamed: House Price Index -> FHFA House Price Index (y/y / m/m)
- Renamed: CB Consumer Confidence -> Conference Board Consumer Confidence
- Removed: ATB Auctions, Gilt Tender, Richmond Fed Shipments/Services, Dallas Fed Services

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-07-25 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with BRC, ADP, FHFA, and Trade Balance renames
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
