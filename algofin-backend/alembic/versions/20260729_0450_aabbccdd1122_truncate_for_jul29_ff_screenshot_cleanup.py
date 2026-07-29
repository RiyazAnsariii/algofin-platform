"""truncate_for_jul29_ff_screenshot_cleanup

Revision ID: aabbccdd1122
Revises: 889900112233
Create Date: 2026-07-29 04:50:00.000000

Jul 29 Forex Factory Screenshot Cross-Reference Cleanup
=======================================================
Events on AlgoFin NOT present on Forex Factory → permanently blacklisted:
  • "Trimmed Mean CPI"       (AUD) — FF has "Trimmed Mean CPI m/m" not standalone
  • "CPI"                    (AUD) — FF has "CPI m/m" / "CPI y/y", not bare "CPI"
  • "Import Prices m/m"      (EUR) — FF uses "German Import Prices m/m"
  • "Mortgage Lending"       (GBP) — not in FF
  • "BoE Consumer Credit"    (GBP) — not in FF
  • "Advance GDP q/q"        (EUR) — FF uses "Flash GDP q/q" for Eurozone; USD-only
  • "Wage Growth y/y"        (EUR) — not in FF

Impact Fixes (Forex Factory Jul 29 screenshot):
  • AUD "CPI m/m"            → 🔴 High (was blocked by generic CPI blacklist, now whitelisted)
  • AUD "CPI y/y"            → 🔴 High (was blocked by generic CPI blacklist, now whitelisted)
  • AUD "Trimmed Mean CPI m/m" → 🔴 High (explicitly listed in FORCED_HIGH_IMPACT_PATTERNS)

Currency Verified (Jul 29 FF screenshot):
  • USD, AUD, EUR, GBP, CAD — all correct
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "aabbccdd1122"
down_revision = "889900112233"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Truncate economic_events so the next API request re-seeds with correct
    # FF-aligned data (blacklist rules + impact overrides now applied).
    op.execute("DELETE FROM economic_events")


def downgrade() -> None:
    # Truncation is not reversible — downgrade is a no-op.
    pass
