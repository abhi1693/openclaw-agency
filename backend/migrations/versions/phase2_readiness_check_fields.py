"""add readiness_check fields to ppc_proposal_items

Adds readiness_check (readiness status code) and readiness_detail
(human-readable reason) columns to ppc_proposal_items, enabling the
Phase 2 proposal readiness/preflight API without modifying any
existing column or constraint.

Revision ID: phase2_readiness_check
Revises: z8a9b0c1d2e3
Create Date: 2026-04-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "phase2_readiness_check"
down_revision = "z8a9b0c1d2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ppc_proposal_items",
        sa.Column("readiness_check", sa.String(), nullable=True),
    )
    op.add_column(
        "ppc_proposal_items",
        sa.Column("readiness_detail", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_ppc_proposal_items_readiness_check",
        "ppc_proposal_items",
        ["readiness_check"],
    )


def downgrade() -> None:
    op.drop_index("ix_ppc_proposal_items_readiness_check", table_name="ppc_proposal_items")
    op.drop_column("ppc_proposal_items", "readiness_detail")
    op.drop_column("ppc_proposal_items", "readiness_check")
