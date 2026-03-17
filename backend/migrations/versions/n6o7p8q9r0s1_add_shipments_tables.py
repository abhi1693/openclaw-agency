"""Add shipments and shipment_events tables.

Revision ID: n6o7p8q9r0s1
Revises: m5n6o7p8q9r0
Create Date: 2026-03-16

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "n6o7p8q9r0s1"
down_revision = "m5n6o7p8q9r0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shipments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("booking_number", sa.String(), nullable=False),
        sa.Column("container_number", sa.String(), nullable=False, server_default=""),
        sa.Column("bl_number", sa.String(), nullable=False, server_default=""),
        sa.Column("carrier", sa.String(), nullable=False, server_default=""),
        sa.Column("carrier_scac", sa.String(), nullable=False, server_default=""),
        sa.Column("vessel_name", sa.String(), nullable=False, server_default=""),
        sa.Column("voyage_number", sa.String(), nullable=False, server_default=""),
        sa.Column("port_of_loading", sa.String(), nullable=False, server_default=""),
        sa.Column("port_of_discharge", sa.String(), nullable=False, server_default=""),
        sa.Column("container_type", sa.String(), nullable=False, server_default=""),
        sa.Column("weight_kg", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("etd", sa.DateTime(timezone=True), nullable=True),
        sa.Column("eta", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_departure", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_arrival", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="booked"),
        sa.Column("last_event", sa.String(), nullable=False, server_default=""),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tracking_source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("supplier", sa.String(), nullable=False, server_default=""),
        sa.Column("reference", sa.String(), nullable=False, server_default=""),
        sa.Column("notes", sa.String(), nullable=False, server_default=""),
        sa.Column("freight_cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("customs_cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("other_cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_shipments_booking_number", "shipments", ["booking_number"])

    op.create_table(
        "shipment_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("shipment_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False, server_default=""),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("location", sa.String(), nullable=False, server_default=""),
        sa.Column("vessel_name", sa.String(), nullable=False, server_default=""),
        sa.Column("event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default=""),
        sa.Column("raw_data", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_shipment_events_shipment_id", "shipment_events", ["shipment_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_shipment_events_shipment_id", table_name="shipment_events")
    op.drop_table("shipment_events")
    op.drop_index("ix_shipments_booking_number", table_name="shipments")
    op.drop_table("shipments")
