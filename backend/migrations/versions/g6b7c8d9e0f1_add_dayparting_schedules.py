"""add dayparting schedules table

Creates:
  - dayparting_schedules table

Revision ID: g6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-03-31
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "g6b7c8d9e0f1"
down_revision = "f5a6b7c8d9e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dayparting_schedules",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("campaign_id", sa.String(), nullable=False),
        sa.Column("campaign_name", sa.String(), nullable=True),
        sa.Column("hourly_multipliers", sa.String(), nullable=False, server_default="[]"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("campaign_id", name="uq_dayparting_schedules_campaign_id"),
    )
    op.create_index("ix_dayparting_schedules_campaign_id", "dayparting_schedules", ["campaign_id"])


def downgrade() -> None:
    op.drop_table("dayparting_schedules")
