"""add reimbursement_id to refund_claims

Revision ID: u3v4w5x6y7z8
Revises: t2u3v4w5x6y7
Create Date: 2026-03-19

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "u3v4w5x6y7z8"
down_revision = "t2u3v4w5x6y7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "refund_claims",
        sa.Column("reimbursement_id", sa.String(length=50), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("refund_claims", "reimbursement_id")
