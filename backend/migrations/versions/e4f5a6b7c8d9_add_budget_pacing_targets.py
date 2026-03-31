"""add budget pacing targets table

Creates:
  - budget_pacing_targets table

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-03-31
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "e4f5a6b7c8d9"
down_revision = "d3e4f5a6b7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "budget_pacing_targets",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("campaign_id", sa.String(), nullable=False),
        sa.Column("campaign_name", sa.String(), nullable=True),
        sa.Column("monthly_budget", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("campaign_id", name="uq_budget_pacing_targets_campaign_id"),
    )
    op.create_index("ix_budget_pacing_targets_campaign_id", "budget_pacing_targets", ["campaign_id"])


def downgrade() -> None:
    op.drop_table("budget_pacing_targets")
