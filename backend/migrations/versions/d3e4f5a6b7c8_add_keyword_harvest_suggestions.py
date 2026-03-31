"""add keyword harvest suggestions table

Creates:
  - keyword_harvest_suggestions table

Revision ID: d3e4f5a6b7c8
Revises: c1d2e3f4a5b6
Create Date: 2026-03-31
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d3e4f5a6b7c8"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "keyword_harvest_suggestions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("search_term", sa.String(), nullable=False),
        sa.Column("campaign_id", sa.String(), nullable=True),
        sa.Column("campaign_name", sa.String(), nullable=True),
        sa.Column("impressions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("orders", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("spend", sa.Numeric(12, 4), nullable=True),
        sa.Column("acos", sa.Numeric(8, 4), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("min_orders_threshold", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("min_clicks_threshold", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("max_acos_threshold", sa.Numeric(8, 4), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("resolved_by", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_keyword_harvest_suggestions_search_term", "keyword_harvest_suggestions", ["search_term"])
    op.create_index("ix_keyword_harvest_suggestions_campaign_id", "keyword_harvest_suggestions", ["campaign_id"])
    op.create_index("ix_keyword_harvest_suggestions_action", "keyword_harvest_suggestions", ["action"])
    op.create_index("ix_keyword_harvest_suggestions_status", "keyword_harvest_suggestions", ["status"])
    op.create_index("ix_keyword_harvest_suggestions_created_at", "keyword_harvest_suggestions", ["created_at"])


def downgrade() -> None:
    op.drop_table("keyword_harvest_suggestions")
