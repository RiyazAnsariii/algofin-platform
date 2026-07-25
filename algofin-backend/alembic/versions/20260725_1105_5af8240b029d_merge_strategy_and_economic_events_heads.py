"""merge strategy and economic events heads

Revision ID: 5af8240b029d
Revises: b31f90d22e44, e7b892a40f11
Create Date: 2026-07-25 11:05:43.820130

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5af8240b029d'
down_revision: Union[str, None] = ('b31f90d22e44', 'e7b892a40f11')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
