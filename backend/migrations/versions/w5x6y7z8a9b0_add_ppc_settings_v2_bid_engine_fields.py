"""add ppc settings v2 bid engine fields

Adds 6 new columns to ppc_automation_settings for the intelligent bid engine v2:
  damping_factor, max_step_down_pct, max_step_up_pct, launch_mode,
  launch_mode_until, exploration_pct

Revision ID: w5x6y7z8a9b0
Revises: v4w5x6y7z8a9
Create Date: 2026-03-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "w5x6y7z8a9b0"
down_revision = "v4w5x6y7z8a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ppc_automation_settings", sa.Column("damping_factor", sa.Float(), nullable=False, server_default="0.3"))
    op.add_column("ppc_automation_settings", sa.Column("max_step_down_pct", sa.Float(), nullable=False, server_default="0.15"))
    op.add_column("ppc_automation_settings", sa.Column("max_step_up_pct", sa.Float(), nullable=False, server_default="0.10"))
    op.add_column("ppc_automation_settings", sa.Column("launch_mode", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("ppc_automation_settings", sa.Column("launch_mode_until", sa.Date(), nullable=True))
    op.add_column("ppc_automation_settings", sa.Column("exploration_pct", sa.Float(), nullable=False, server_default="0.15"))


def downgrade() -> None:
    op.drop_column("ppc_automation_settings", "exploration_pct")
    op.drop_column("ppc_automation_settings", "launch_mode_until")
    op.drop_column("ppc_automation_settings", "launch_mode")
    op.drop_column("ppc_automation_settings", "max_step_up_pct")
    op.drop_column("ppc_automation_settings", "max_step_down_pct")
    op.drop_column("ppc_automation_settings", "damping_factor")
