"""add ppc_proposals table

Creates:
  - ppc_proposals table
  - ppc_proposal_items table

Revision ID: i8j9k0l1m2n3
Revises: h7c8d9e0f1a2
Create Date: 2026-04-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "i8j9k0l1m2n3"
down_revision = "h7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ppc_proposals",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("approved_by", sa.String(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("applied_by", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ppc_proposals_status", "ppc_proposals", ["status"])
    op.create_index("ix_ppc_proposals_created_at", "ppc_proposals", ["created_at"])

    op.create_table(
        "ppc_proposal_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("proposal_id", sa.UUID(), nullable=False),
        sa.Column("recommendation_type", sa.String(), nullable=False),
        sa.Column("recommendation_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ppc_proposal_items_proposal_id", "ppc_proposal_items", ["proposal_id"])
    op.create_index(
        "ix_ppc_proposal_items_recommendation_type",
        "ppc_proposal_items",
        ["recommendation_type"],
    )
    op.create_index(
        "ix_ppc_proposal_items_recommendation_id",
        "ppc_proposal_items",
        ["recommendation_id"],
    )
    op.create_index("ix_ppc_proposal_items_created_at", "ppc_proposal_items", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ppc_proposal_items_created_at", table_name="ppc_proposal_items")
    op.drop_index("ix_ppc_proposal_items_recommendation_id", table_name="ppc_proposal_items")
    op.drop_index("ix_ppc_proposal_items_recommendation_type", table_name="ppc_proposal_items")
    op.drop_index("ix_ppc_proposal_items_proposal_id", table_name="ppc_proposal_items")
    op.drop_table("ppc_proposal_items")
    op.drop_index("ix_ppc_proposals_created_at", table_name="ppc_proposals")
    op.drop_index("ix_ppc_proposals_status", table_name="ppc_proposals")
    op.drop_table("ppc_proposals")
