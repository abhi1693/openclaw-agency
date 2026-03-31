"""add campaign goals and bid suggestions tables

Creates:
  - campaign_goals table
  - bid_suggestions table

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-03-31
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f5a6b7c8d9e0"
down_revision = "e4f5a6b7c8d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campaign_goals",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("campaign_id", sa.String(), nullable=False),
        sa.Column("campaign_name", sa.String(), nullable=True),
        sa.Column("goal_mode", sa.String(), nullable=False, server_default="target_acos"),
        sa.Column("target_acos", sa.Float(), nullable=False, server_default="25.0"),
        sa.Column("kp", sa.Float(), nullable=False, server_default="0.3"),
        sa.Column("ki", sa.Float(), nullable=False, server_default="0.05"),
        sa.Column("kd", sa.Float(), nullable=False, server_default="0.1"),
        sa.Column("max_bid_adjustment_pct", sa.Float(), nullable=False, server_default="0.15"),
        sa.Column("pid_integral", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pid_last_error", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("campaign_id", name="uq_campaign_goals_campaign_id"),
    )
    op.create_index("ix_campaign_goals_campaign_id", "campaign_goals", ["campaign_id"])

    op.create_table(
        "bid_suggestions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("campaign_id", sa.String(), nullable=False),
        sa.Column("campaign_name", sa.String(), nullable=True),
        sa.Column("goal_mode", sa.String(), nullable=False, server_default="target_acos"),
        sa.Column("actual_acos", sa.Float(), nullable=True),
        sa.Column("target_acos", sa.Float(), nullable=True),
        sa.Column("pid_error", sa.Float(), nullable=True),
        sa.Column("bid_adjustment_pct", sa.Float(), nullable=True),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("resolved_by", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bid_suggestions_campaign_id", "bid_suggestions", ["campaign_id"])
    op.create_index("ix_bid_suggestions_status", "bid_suggestions", ["status"])
    op.create_index("ix_bid_suggestions_created_at", "bid_suggestions", ["created_at"])


def downgrade() -> None:
    op.drop_table("bid_suggestions")
    op.drop_table("campaign_goals")
