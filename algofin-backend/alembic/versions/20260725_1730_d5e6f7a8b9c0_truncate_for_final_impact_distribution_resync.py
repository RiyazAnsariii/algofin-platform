"""truncate_economic_events_for_final_impact_distribution_resync

Truncates economic_events so the cold-start sync immediately repopulates with:
- 🔴 High: Australian CPI (all variants), Eurozone Advance/Flash GDP, Eurozone Unemployment Rate, Federal Funds Rate, FOMC Statement, Central Bank Rates/Statements/Speeches, CPI, NFP, GDP
- 🟠 Medium: API Weekly Crude Oil Stock, Crude Oil Inventories, Mortgage Approvals, M4 Money Supply, Net Lending to Individuals, Mortgage Lending, BoE Consumer Credit, Retail Sales m/m, BoC Summary of Deliberations, Personal Income/Spending m/m, French Consumer Spending, PPI m/m, Eurozone & JPY Consumer Confidence
- 🟡 Low: German Import Prices, Wage Growth, UBS Economic Expectations, German Bond Auctions, Natural Gas, PCE Prices q/q, ANZ Business Confidence, Building Approvals, KOF Barometer

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-07-25 17:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with Final Impact Distribution classifications
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
