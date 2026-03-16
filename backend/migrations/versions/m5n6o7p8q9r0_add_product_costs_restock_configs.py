"""add_product_costs_restock_configs

Revision ID: m5n6o7p8q9r0
Revises: l4m5n6o7p8q9
Create Date: 2026-03-16

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "m5n6o7p8q9r0"
down_revision = "l4m5n6o7p8q9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_costs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sku", sa.String(), nullable=False),
        sa.Column("asin", sa.String(), nullable=False, server_default=""),
        sa.Column("product_name", sa.String(), nullable=False, server_default=""),
        sa.Column("unit_cost", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("shipping_to_port", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("freight", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("customs", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("duty_rate", sa.Numeric(8, 4), nullable=False, server_default="0"),
        sa.Column("last_mile", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("prep", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("other_cost", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("total_landed_cost", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(), nullable=False, server_default="USD"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku", name="uq_product_costs_sku"),
    )
    op.create_index("ix_product_costs_sku", "product_costs", ["sku"])

    op.create_table(
        "restock_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("asin", sa.String(), nullable=False),
        sa.Column("lead_time_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("fba_prep_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("safety_stock_days", sa.Integer(), nullable=False, server_default="14"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asin", name="uq_restock_configs_asin"),
    )
    op.create_index("ix_restock_configs_asin", "restock_configs", ["asin"])


def downgrade() -> None:
    op.drop_table("restock_configs")
    op.drop_table("product_costs")
