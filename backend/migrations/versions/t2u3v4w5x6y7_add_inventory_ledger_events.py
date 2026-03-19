"""add inventory_ledger_events table

Revision ID: t2u3v4w5x6y7
Revises: s1t2u3v4w5x6
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa

revision = "t2u3v4w5x6y7"
down_revision = "s1t2u3v4w5x6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inventory_ledger_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("fnsku", sa.String(), nullable=False),
        sa.Column("asin", sa.String(), nullable=False, server_default=""),
        sa.Column("sku", sa.String(), nullable=False, server_default=""),
        sa.Column("title", sa.String(), nullable=False, server_default=""),
        sa.Column("disposition", sa.String(), nullable=False, server_default=""),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("reference_id", sa.String(), nullable=False, server_default=""),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fulfillment_center", sa.String(), nullable=False, server_default=""),
        sa.Column("country", sa.String(), nullable=False, server_default="US"),
        sa.Column("synced_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "event_date", "fnsku", "event_type", "reference_id", "quantity", "fulfillment_center",
            name="uq_inventory_ledger_identity",
        ),
    )
    op.create_index("ix_inventory_ledger_events_event_date", "inventory_ledger_events", ["event_date"])
    op.create_index("ix_inventory_ledger_events_fnsku", "inventory_ledger_events", ["fnsku"])
    op.create_index("ix_inventory_ledger_events_event_type", "inventory_ledger_events", ["event_type"])
    op.create_index("ix_inventory_ledger_events_reference_id", "inventory_ledger_events", ["reference_id"])


def downgrade() -> None:
    op.drop_index("ix_inventory_ledger_events_reference_id", "inventory_ledger_events")
    op.drop_index("ix_inventory_ledger_events_event_type", "inventory_ledger_events")
    op.drop_index("ix_inventory_ledger_events_fnsku", "inventory_ledger_events")
    op.drop_index("ix_inventory_ledger_events_event_date", "inventory_ledger_events")
    op.drop_table("inventory_ledger_events")
