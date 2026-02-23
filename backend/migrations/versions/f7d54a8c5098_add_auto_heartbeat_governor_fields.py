"""add auto heartbeat governor fields

Revision ID: f7d54a8c5098
Revises: b7a1d9c3e4f5
Create Date: 2026-02-23 11:04:51.730825

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f7d54a8c5098'
down_revision = 'b7a1d9c3e4f5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("auto_heartbeat_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "agents",
        sa.Column("auto_heartbeat_step", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "agents",
        sa.Column("auto_heartbeat_off", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "agents",
        sa.Column("auto_heartbeat_last_active_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        op.f("ix_agents_auto_heartbeat_enabled"),
        "agents",
        ["auto_heartbeat_enabled"],
        unique=False,
    )
    op.create_index(
        op.f("ix_agents_auto_heartbeat_off"),
        "agents",
        ["auto_heartbeat_off"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_agents_auto_heartbeat_off"), table_name="agents")
    op.drop_index(op.f("ix_agents_auto_heartbeat_enabled"), table_name="agents")

    op.drop_column("agents", "auto_heartbeat_last_active_at")
    op.drop_column("agents", "auto_heartbeat_off")
    op.drop_column("agents", "auto_heartbeat_step")
    op.drop_column("agents", "auto_heartbeat_enabled")
