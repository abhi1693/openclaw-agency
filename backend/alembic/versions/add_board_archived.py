"""add board archived field

Revision ID: add_board_archived
Revises: af403671a8c4
Create Date: 2026-02-08 15:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'add_board_archived'
down_revision: Union[str, None] = 'af403671a8c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('boards', sa.Column('archived', sa.Boolean(), nullable=False, server_default='false'))
    op.create_index('ix_boards_archived', 'boards', ['archived'])


def downgrade() -> None:
    op.drop_index('ix_boards_archived', 'boards')
    op.drop_column('boards', 'archived')
