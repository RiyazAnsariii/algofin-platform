"""truncate_economic_events_for_july_30_ff_alignment_resync

Truncates economic_events so the cold-start sync immediately repopulates with:
- Kept High 🔴: FOMC Press Conference, BOE/RBA Speeches, Eurozone/German/Spanish/Italian GDP, German CPI, US Advance GDP q/q, Core PCE m/m & y/y, PCE m/m & y/y, Initial Jobless Claims
- Changed High -> Medium 🟠: French Consumer Spending m/m, Producer Price Index (PPI) m/m, Retail Sales m/m, BoE Rate Votes, Personal Income/Spending m/m, Eurozone/JPY Consumer Confidence
- Changed High -> Low 🟡: Core PCE Prices q/q Advance, PCE Prices q/q Advance, EIA Natural Gas Storage Change, ANZ Business Confidence, Building Approvals, Import/Export Prices, KOF Barometer
- Renamed: Eurozone Flash GDP q/q / y/y, Eurozone GDP y/y, Eurozone Consumer Confidence, JPY Consumer Confidence, US Advance GDP q/q, Producer Price Index (PPI) m/m
- Removed: Italian 10-Year Bond Auction

Revision ID: c4d5e6f7a8b9
Revises: a2b3c4d5e6f7
Create Date: 2026-07-25 17:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with July 30 Forex Factory title & impact alignments
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
