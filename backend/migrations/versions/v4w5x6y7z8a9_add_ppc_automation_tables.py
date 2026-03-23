"""add ppc automation tables

Revision ID: v4w5x6y7z8a9
Revises: u3v4w5x6y7z8
Create Date: 2026-03-23

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "v4w5x6y7z8a9"
down_revision = "u3v4w5x6y7z8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # hourly_campaign_metrics
    op.create_table(
        "hourly_campaign_metrics",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("campaign_id", sa.String(), nullable=False),
        sa.Column("ad_group_id", sa.String(), nullable=True),
        sa.Column("keyword_id", sa.String(), nullable=True),
        sa.Column("match_type", sa.String(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("hour", sa.Integer(), nullable=False),
        sa.Column("impressions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost", sa.Numeric(14, 4), nullable=False, server_default="0"),
        sa.Column("sales", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("orders", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hourly_campaign_metrics_campaign_id", "hourly_campaign_metrics", ["campaign_id"])
    op.create_index("ix_hourly_campaign_metrics_ad_group_id", "hourly_campaign_metrics", ["ad_group_id"])
    op.create_index("ix_hourly_campaign_metrics_keyword_id", "hourly_campaign_metrics", ["keyword_id"])
    op.create_index("ix_hourly_campaign_metrics_date", "hourly_campaign_metrics", ["date"])
    op.create_index("ix_hourly_campaign_metrics_hour", "hourly_campaign_metrics", ["hour"])

    # bid_recommendations
    op.create_table(
        "bid_recommendations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("campaign_id", sa.String(), nullable=False),
        sa.Column("ad_group_id", sa.String(), nullable=True),
        sa.Column("keyword_id", sa.String(), nullable=True),
        sa.Column("match_type", sa.String(), nullable=True),
        sa.Column("current_bid", sa.Numeric(10, 4), nullable=False),
        sa.Column("recommended_bid", sa.Numeric(10, 4), nullable=False),
        sa.Column("conversion_rate", sa.Numeric(8, 6), nullable=True),
        sa.Column("target_acos", sa.Numeric(6, 4), nullable=True),
        sa.Column("aov", sa.Numeric(10, 2), nullable=True),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("applied_by", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bid_recommendations_campaign_id", "bid_recommendations", ["campaign_id"])
    op.create_index("ix_bid_recommendations_ad_group_id", "bid_recommendations", ["ad_group_id"])
    op.create_index("ix_bid_recommendations_keyword_id", "bid_recommendations", ["keyword_id"])
    op.create_index("ix_bid_recommendations_status", "bid_recommendations", ["status"])
    op.create_index("ix_bid_recommendations_created_at", "bid_recommendations", ["created_at"])

    # keyword_recommendations
    op.create_table(
        "keyword_recommendations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_campaign_id", sa.String(), nullable=False),
        sa.Column("search_term", sa.String(), nullable=False),
        sa.Column("match_type", sa.String(), nullable=False),
        sa.Column("impressions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("orders", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ctr", sa.Numeric(8, 6), nullable=True),
        sa.Column("conversion_rate", sa.Numeric(8, 6), nullable=True),
        sa.Column("acos", sa.Numeric(8, 4), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("target_campaign_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_keyword_recommendations_source_campaign_id", "keyword_recommendations", ["source_campaign_id"])
    op.create_index("ix_keyword_recommendations_search_term", "keyword_recommendations", ["search_term"])
    op.create_index("ix_keyword_recommendations_action", "keyword_recommendations", ["action"])
    op.create_index("ix_keyword_recommendations_target_campaign_id", "keyword_recommendations", ["target_campaign_id"])
    op.create_index("ix_keyword_recommendations_status", "keyword_recommendations", ["status"])
    op.create_index("ix_keyword_recommendations_created_at", "keyword_recommendations", ["created_at"])

    # budget_allocations
    op.create_table(
        "budget_allocations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("parent_asin", sa.String(), nullable=False),
        sa.Column("total_daily_budget", sa.Numeric(10, 2), nullable=False),
        sa.Column("sp_pct", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("sb_pct", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("sd_pct", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("sbv_pct", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("sp_actual_spend", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("sb_actual_spend", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("sd_actual_spend", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("sbv_actual_spend", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_budget_allocations_parent_asin", "budget_allocations", ["parent_asin"])
    op.create_index("ix_budget_allocations_date", "budget_allocations", ["date"])

    # ppc_automation_settings
    op.create_table(
        "ppc_automation_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("parent_asin", sa.String(), nullable=False),
        sa.Column("target_acos", sa.Numeric(6, 4), nullable=False),
        sa.Column("min_bid", sa.Numeric(10, 4), nullable=False),
        sa.Column("max_bid", sa.Numeric(10, 4), nullable=False),
        sa.Column("bid_change_limit_pct", sa.Numeric(5, 4), nullable=False, server_default="0.2"),
        sa.Column("dayparting_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("auto_negative_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("auto_keyword_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("parent_asin", name="uq_ppc_automation_settings_parent_asin"),
    )
    op.create_index("ix_ppc_automation_settings_parent_asin", "ppc_automation_settings", ["parent_asin"])

    # ppc_change_log
    op.create_table(
        "ppc_change_log",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("change_type", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("old_value", sa.String(), nullable=True),
        sa.Column("new_value", sa.String(), nullable=True),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("triggered_by", sa.String(), nullable=False, server_default="system"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ppc_change_log_change_type", "ppc_change_log", ["change_type"])
    op.create_index("ix_ppc_change_log_entity_type", "ppc_change_log", ["entity_type"])
    op.create_index("ix_ppc_change_log_entity_id", "ppc_change_log", ["entity_id"])
    op.create_index("ix_ppc_change_log_triggered_by", "ppc_change_log", ["triggered_by"])
    op.create_index("ix_ppc_change_log_created_at", "ppc_change_log", ["created_at"])


def downgrade() -> None:
    op.drop_table("ppc_change_log")
    op.drop_table("ppc_automation_settings")
    op.drop_table("budget_allocations")
    op.drop_table("keyword_recommendations")
    op.drop_table("bid_recommendations")
    op.drop_table("hourly_campaign_metrics")
