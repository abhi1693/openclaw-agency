"""remove hr module

Revision ID: 4dffc5312eb8
Revises: bacd5e6a253d
Create Date: 2026-02-02 16:46:47.579836

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4dffc5312eb8"
down_revision: Union[str, Sequence[str], None] = "bacd5e6a253d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # Drop HR tables. If they don't exist (fresh db + baseline changed later), be safe.
    op.execute("DROP TABLE IF EXISTS headcount_requests CASCADE")
    op.execute("DROP TABLE IF EXISTS employment_actions CASCADE")
    op.execute("DROP TABLE IF EXISTS agent_onboardings CASCADE")


def downgrade() -> None:
    """Downgrade schema."""

    # We intentionally do not recreate the HR tables; HR module is removed.
    # If ever needed, re-introduce with a new migration.
    pass
