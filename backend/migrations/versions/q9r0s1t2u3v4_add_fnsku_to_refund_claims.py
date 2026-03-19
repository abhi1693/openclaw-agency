"""Add fnsku to refund_claims.

Revision ID: q9r0s1t2u3v4
Revises: p8q9r0s1t2u3
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "q9r0s1t2u3v4"
down_revision = "p8q9r0s1t2u3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "refund_claims",
        sa.Column("fnsku", sa.String(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("refund_claims", "fnsku")
