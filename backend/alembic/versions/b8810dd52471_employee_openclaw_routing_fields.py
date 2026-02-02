"""employee_openclaw_routing_fields

Revision ID: b8810dd52471
Revises: 2b8d1e2c0d01
Create Date: 2026-02-02 16:03:56.528787

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b8810dd52471"
down_revision: Union[str, Sequence[str], None] = "2b8d1e2c0d01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("employees", sa.Column("openclaw_session_key", sa.String(), nullable=True))
    op.add_column("employees", sa.Column("notify_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("employees", "notify_enabled")
    op.drop_column("employees", "openclaw_session_key")
