"""truncate_economic_events_for_forex_factory_impact_levels_resync

Truncates economic_events so the cold-start sync immediately repopulates with
Forex Factory impact levels (🔴 High, 🟠 Medium, 🟡 Low) matching the exact
impact taxonomy:
- High: Central Bank rates/speeches/statements, CPI, NFP, Unemployment Rate, Jobless Claims, GDP, Crude Oil Inventories
- Medium: PPI, Retail Sales, Personal Spending/Income, PMIs, Money Supply, Private/Corporate Loans
- Low: Regional data, Housing, Industrial production, Trade balance

Revision ID: a2b3c4d5e6f7
Revises: e4f5a6b7c8d9
Create Date: 2026-07-25 15:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'e4f5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear all events so cold-start sync populates with Forex Factory impact classifications
    op.execute("TRUNCATE TABLE economic_events;")


def downgrade() -> None:
    pass
