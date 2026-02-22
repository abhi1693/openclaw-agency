"""add gateway registration fields

Revision ID: g2r1a2b3c4d5
Revises: h5a1b2c3d4e5
Create Date: 2026-02-22 18:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "g2r1a2b3c4d5"
down_revision = "h5a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("gateways")}

    if "registration_token_hash" not in existing_columns:
        op.add_column(
            "gateways",
            sa.Column(
                "registration_token_hash",
                sa.String(length=255),
                nullable=True,
            ),
        )

    if "status" not in existing_columns:
        op.add_column(
            "gateways",
            sa.Column(
                "status",
                sa.String(length=32),
                server_default="pending",
                nullable=False,
            ),
        )

    if "last_heartbeat_at" not in existing_columns:
        op.add_column(
            "gateways",
            sa.Column("last_heartbeat_at", sa.DateTime(), nullable=True),
        )

    if "connection_info" not in existing_columns:
        op.add_column(
            "gateways",
            sa.Column("connection_info", sa.JSON(), nullable=True),
        )

    if "auto_registered" not in existing_columns:
        op.add_column(
            "gateways",
            sa.Column(
                "auto_registered",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            ),
        )

    # Index on status for health monitoring queries
    gw_indexes = {item.get("name") for item in inspector.get_indexes("gateways")}
    if "ix_gateways_status" not in gw_indexes:
        op.create_index("ix_gateways_status", "gateways", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_gateways_status", table_name="gateways")
    op.drop_column("gateways", "auto_registered")
    op.drop_column("gateways", "connection_info")
    op.drop_column("gateways", "last_heartbeat_at")
    op.drop_column("gateways", "status")
    op.drop_column("gateways", "registration_token_hash")
