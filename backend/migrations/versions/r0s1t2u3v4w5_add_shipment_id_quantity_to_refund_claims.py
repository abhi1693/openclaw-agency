"""Add shipment_id and quantity to refund_claims.

Revision ID: r0s1t2u3v4w5
Revises: q9r0s1t2u3v4
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "r0s1t2u3v4w5"
down_revision = "q9r0s1t2u3v4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "refund_claims",
        sa.Column("shipment_id", sa.String(), nullable=False, server_default=""),
    )
    op.add_column(
        "refund_claims",
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("refund_claims", "quantity")
    op.drop_column("refund_claims", "shipment_id")
