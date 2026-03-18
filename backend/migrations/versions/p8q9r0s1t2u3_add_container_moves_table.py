"""Add container_moves table.

Revision ID: p8q9r0s1t2u3
Revises: o7p8q9r0s1t2
Create Date: 2026-03-18

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "p8q9r0s1t2u3"
down_revision = "o7p8q9r0s1t2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "container_moves",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("shipment_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.String(), nullable=False, server_default=""),
        sa.Column("move_type", sa.String(), nullable=False, server_default=""),
        sa.Column("location", sa.String(), nullable=False, server_default=""),
        sa.Column("vessel_voyage", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_container_moves_shipment_id", "container_moves", ["shipment_id"])


def downgrade() -> None:
    op.drop_index("ix_container_moves_shipment_id", table_name="container_moves")
    op.drop_table("container_moves")
