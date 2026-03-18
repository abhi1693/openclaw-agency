"""Add detail fields to shipments table.

Revision ID: o7p8q9r0s1t2
Revises: n6o7p8q9r0s1
Create Date: 2026-03-18

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "o7p8q9r0s1t2"
down_revision = "n6o7p8q9r0s1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Basic Info — route
    op.add_column("shipments", sa.Column("place_of_receipt", sa.String(), nullable=False, server_default=""))
    op.add_column("shipments", sa.Column("place_of_delivery", sa.String(), nullable=False, server_default=""))

    # Container Activity
    op.add_column("shipments", sa.Column("service_type", sa.String(), nullable=False, server_default=""))
    op.add_column("shipments", sa.Column("cargo_quantity", sa.String(), nullable=False, server_default=""))
    op.add_column("shipments", sa.Column("cbm", sa.Numeric(10, 4), nullable=True))
    op.add_column("shipments", sa.Column("tare_weight_kg", sa.Integer(), nullable=True))
    op.add_column("shipments", sa.Column("weight_method", sa.String(), nullable=False, server_default=""))
    op.add_column("shipments", sa.Column("vgm_weight", sa.Integer(), nullable=True))
    op.add_column("shipments", sa.Column("pickup_date", sa.DateTime(), nullable=True))
    op.add_column("shipments", sa.Column("pickup_depot", sa.String(), nullable=False, server_default=""))
    op.add_column("shipments", sa.Column("full_in_date", sa.DateTime(), nullable=True))
    op.add_column("shipments", sa.Column("full_return_to", sa.String(), nullable=False, server_default=""))

    # Dates
    op.add_column("shipments", sa.Column("vgm_cutoff_date", sa.DateTime(), nullable=True))
    op.add_column("shipments", sa.Column("cutoff_date", sa.DateTime(), nullable=True))
    op.add_column("shipments", sa.Column("estimated_on_board_date", sa.DateTime(), nullable=True))
    op.add_column("shipments", sa.Column("issue_date", sa.DateTime(), nullable=True))

    # Booking metadata
    op.add_column("shipments", sa.Column("stowage_code", sa.String(), nullable=False, server_default=""))
    op.add_column("shipments", sa.Column("exchange_rate", sa.Numeric(10, 4), nullable=True))


def downgrade() -> None:
    op.drop_column("shipments", "exchange_rate")
    op.drop_column("shipments", "stowage_code")
    op.drop_column("shipments", "issue_date")
    op.drop_column("shipments", "estimated_on_board_date")
    op.drop_column("shipments", "cutoff_date")
    op.drop_column("shipments", "vgm_cutoff_date")
    op.drop_column("shipments", "full_return_to")
    op.drop_column("shipments", "full_in_date")
    op.drop_column("shipments", "pickup_depot")
    op.drop_column("shipments", "pickup_date")
    op.drop_column("shipments", "vgm_weight")
    op.drop_column("shipments", "weight_method")
    op.drop_column("shipments", "tare_weight_kg")
    op.drop_column("shipments", "cbm")
    op.drop_column("shipments", "cargo_quantity")
    op.drop_column("shipments", "service_type")
    op.drop_column("shipments", "place_of_delivery")
    op.drop_column("shipments", "place_of_receipt")
