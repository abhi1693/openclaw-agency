"""add_reimbursement_events_refund_claims

Revision ID: l4m5n6o7p8q9
Revises: k3l4m5n6o7p8
Create Date: 2026-03-16

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "l4m5n6o7p8q9"
down_revision = "k3l4m5n6o7p8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reimbursement_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("reimbursement_id", sa.String(), nullable=False),
        sa.Column("order_id", sa.String(), nullable=False),
        sa.Column("sku", sa.String(), nullable=False, server_default=""),
        sa.Column("asin", sa.String(), nullable=False, server_default=""),
        sa.Column("fnsku", sa.String(), nullable=False, server_default=""),
        sa.Column("reason", sa.String(), nullable=False, server_default=""),
        sa.Column("amount_total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("amount_cash", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("amount_inventory", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reimbursement_date", sa.DateTime(), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reimbursement_id", name="uq_reimbursement_events_id"),
    )
    op.create_index("ix_reimbursement_events_reimbursement_id", "reimbursement_events", ["reimbursement_id"])
    op.create_index("ix_reimbursement_events_order_id", "reimbursement_events", ["order_id"])
    op.create_index("ix_reimbursement_events_reimbursement_date", "reimbursement_events", ["reimbursement_date"])

    op.create_table(
        "refund_claims",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.String(), nullable=False),
        sa.Column("sku", sa.String(), nullable=False, server_default=""),
        sa.Column("asin", sa.String(), nullable=False, server_default=""),
        sa.Column("refund_date", sa.DateTime(), nullable=True),
        sa.Column("refund_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("refund_reason", sa.String(), nullable=False, server_default=""),
        sa.Column("days_since_refund", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("has_return", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("has_reimbursement", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("claim_type", sa.String(), nullable=False, server_default=""),
        sa.Column("claim_scenario", sa.String(), nullable=False, server_default=""),
        sa.Column("priority", sa.String(), nullable=False, server_default="low"),
        sa.Column("status", sa.String(), nullable=False, server_default="actionable"),
        sa.Column("amazon_case_id", sa.String(), nullable=False, server_default=""),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("evidence", sa.String(), nullable=False, server_default=""),
        sa.Column("template_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("notes", sa.String(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", name="uq_refund_claims_order_id"),
    )
    op.create_index("ix_refund_claims_order_id", "refund_claims", ["order_id"])
    op.create_index("ix_refund_claims_refund_date", "refund_claims", ["refund_date"])


def downgrade() -> None:
    op.drop_index("ix_refund_claims_refund_date", table_name="refund_claims")
    op.drop_index("ix_refund_claims_order_id", table_name="refund_claims")
    op.drop_table("refund_claims")
    op.drop_index("ix_reimbursement_events_reimbursement_date", table_name="reimbursement_events")
    op.drop_index("ix_reimbursement_events_order_id", table_name="reimbursement_events")
    op.drop_index("ix_reimbursement_events_reimbursement_id", table_name="reimbursement_events")
    op.drop_table("reimbursement_events")
