"""add board auto heartbeat governor policy

Revision ID: 1c3a2b7d9e10
Revises: f7d54a8c5098
Create Date: 2026-02-23

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "1c3a2b7d9e10"
down_revision = "f7d54a8c5098"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "boards",
        sa.Column(
            "auto_heartbeat_governor_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "boards",
        sa.Column(
            "auto_heartbeat_governor_run_interval_seconds",
            sa.Integer(),
            nullable=False,
            server_default="300",
        ),
    )
    op.add_column(
        "boards",
        sa.Column(
            "auto_heartbeat_governor_ladder",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[\"10m\", \"30m\", \"1h\", \"3h\", \"6h\"]'"),
        ),
    )
    op.add_column(
        "boards",
        sa.Column(
            "auto_heartbeat_governor_lead_cap_every",
            sa.String(),
            nullable=False,
            server_default="1h",
        ),
    )
    op.add_column(
        "boards",
        sa.Column(
            "auto_heartbeat_governor_activity_trigger_type",
            sa.String(),
            nullable=False,
            server_default="B",
        ),
    )


def downgrade() -> None:
    op.drop_column("boards", "auto_heartbeat_governor_activity_trigger_type")
    op.drop_column("boards", "auto_heartbeat_governor_lead_cap_every")
    op.drop_column("boards", "auto_heartbeat_governor_ladder")
    op.drop_column("boards", "auto_heartbeat_governor_run_interval_seconds")
    op.drop_column("boards", "auto_heartbeat_governor_enabled")
