"""add phase6 placement tacos campaign plans

Creates:
  - placement_recommendations table
  - campaign_plans table
Adds to ppc_automation_settings:
  - target_mode VARCHAR DEFAULT 'acos'
  - target_tacos FLOAT NULLABLE

Revision ID: z8a9b0c1d2e3
Revises: y7z8a9b0c1d2
Create Date: 2026-03-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "z8a9b0c1d2e3"
down_revision = "y7z8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── placement_recommendations ─────────────────────────────────────────
    op.create_table(
        "placement_recommendations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("campaign_id", sa.String(), nullable=False),
        sa.Column("campaign_name", sa.String(), nullable=True),
        sa.Column("placement", sa.String(), nullable=False),
        sa.Column("current_modifier_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column("recommended_modifier_pct", sa.Float(), nullable=True),
        sa.Column("placement_impressions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("placement_clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("placement_orders", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("placement_ctr", sa.Float(), nullable=True),
        sa.Column("placement_cvr", sa.Float(), nullable=True),
        sa.Column("placement_acos", sa.Float(), nullable=True),
        sa.Column("placement_roas", sa.Float(), nullable=True),
        sa.Column("campaign_avg_roas", sa.Float(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_placement_recs_campaign_id", "placement_recommendations", ["campaign_id"])
    op.create_index("ix_placement_recs_placement", "placement_recommendations", ["placement"])
    op.create_index("ix_placement_recs_status", "placement_recommendations", ["status"])

    # ── campaign_plans ────────────────────────────────────────────────────
    op.create_table(
        "campaign_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("parent_asin", sa.String(), nullable=False),
        sa.Column("plan", sa.Text(), nullable=False),
        sa.Column("campaign_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_daily_budget", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("applied_by", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_campaign_plans_parent_asin", "campaign_plans", ["parent_asin"])
    op.create_index("ix_campaign_plans_status", "campaign_plans", ["status"])

    # ── ppc_automation_settings additions ────────────────────────────────
    op.add_column(
        "ppc_automation_settings",
        sa.Column("target_mode", sa.String(), nullable=False, server_default="acos"),
    )
    op.add_column(
        "ppc_automation_settings",
        sa.Column("target_tacos", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ppc_automation_settings", "target_tacos")
    op.drop_column("ppc_automation_settings", "target_mode")
    op.drop_index("ix_campaign_plans_status", table_name="campaign_plans")
    op.drop_index("ix_campaign_plans_parent_asin", table_name="campaign_plans")
    op.drop_table("campaign_plans")
    op.drop_index("ix_placement_recs_status", table_name="placement_recommendations")
    op.drop_index("ix_placement_recs_placement", table_name="placement_recommendations")
    op.drop_index("ix_placement_recs_campaign_id", table_name="placement_recommendations")
    op.drop_table("placement_recommendations")
