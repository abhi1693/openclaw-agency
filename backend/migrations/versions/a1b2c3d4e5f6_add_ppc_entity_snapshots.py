"""add_ppc_entity_snapshots

Revision ID: a1b2c3d4e5f6
Revises: v4w5x6y7z8a9
Create Date: 2026-04-20

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "v4w5x6y7z8a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ppc_entity_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("campaign_id", sa.String(), nullable=True),
        sa.Column("ad_group_id", sa.String(), nullable=True),
        sa.Column("parent_entity_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("state", sa.String(), nullable=True),
        sa.Column("serving_status", sa.String(), nullable=True),
        sa.Column("campaign_type", sa.String(), nullable=True),
        sa.Column("targeting_type", sa.String(), nullable=True),
        sa.Column("match_type", sa.String(), nullable=True),
        sa.Column("bid", sa.Numeric(10, 4), nullable=True),
        sa.Column("budget_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("budget_type", sa.String(), nullable=True),
        sa.Column("placement", sa.String(), nullable=True),
        sa.Column("placement_modifier_pct", sa.Numeric(8, 4), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("observed_at", sa.DateTime(), nullable=False),
        sa.Column("synced_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_type", "entity_id", name="uq_ppc_entity_snapshots_identity"),
    )
    op.create_index("ix_ppc_entity_snapshots_entity_type", "ppc_entity_snapshots", ["entity_type"])
    op.create_index("ix_ppc_entity_snapshots_entity_id", "ppc_entity_snapshots", ["entity_id"])
    op.create_index("ix_ppc_entity_snapshots_campaign_id", "ppc_entity_snapshots", ["campaign_id"])
    op.create_index("ix_ppc_entity_snapshots_ad_group_id", "ppc_entity_snapshots", ["ad_group_id"])
    op.create_index("ix_ppc_entity_snapshots_parent_entity_id", "ppc_entity_snapshots", ["parent_entity_id"])
    op.create_index("ix_ppc_entity_snapshots_name", "ppc_entity_snapshots", ["name"])
    op.create_index("ix_ppc_entity_snapshots_state", "ppc_entity_snapshots", ["state"])
    op.create_index("ix_ppc_entity_snapshots_serving_status", "ppc_entity_snapshots", ["serving_status"])
    op.create_index("ix_ppc_entity_snapshots_campaign_type", "ppc_entity_snapshots", ["campaign_type"])
    op.create_index("ix_ppc_entity_snapshots_match_type", "ppc_entity_snapshots", ["match_type"])
    op.create_index("ix_ppc_entity_snapshots_placement", "ppc_entity_snapshots", ["placement"])
    op.create_index("ix_ppc_entity_snapshots_observed_at", "ppc_entity_snapshots", ["observed_at"])
    op.create_index("ix_ppc_entity_snapshots_synced_at", "ppc_entity_snapshots", ["synced_at"])


def downgrade() -> None:
    op.drop_index("ix_ppc_entity_snapshots_synced_at", table_name="ppc_entity_snapshots")
    op.drop_index("ix_ppc_entity_snapshots_observed_at", table_name="ppc_entity_snapshots")
    op.drop_index("ix_ppc_entity_snapshots_placement", table_name="ppc_entity_snapshots")
    op.drop_index("ix_ppc_entity_snapshots_match_type", table_name="ppc_entity_snapshots")
    op.drop_index("ix_ppc_entity_snapshots_campaign_type", table_name="ppc_entity_snapshots")
    op.drop_index("ix_ppc_entity_snapshots_serving_status", table_name="ppc_entity_snapshots")
    op.drop_index("ix_ppc_entity_snapshots_state", table_name="ppc_entity_snapshots")
    op.drop_index("ix_ppc_entity_snapshots_name", table_name="ppc_entity_snapshots")
    op.drop_index("ix_ppc_entity_snapshots_parent_entity_id", table_name="ppc_entity_snapshots")
    op.drop_index("ix_ppc_entity_snapshots_ad_group_id", table_name="ppc_entity_snapshots")
    op.drop_index("ix_ppc_entity_snapshots_campaign_id", table_name="ppc_entity_snapshots")
    op.drop_index("ix_ppc_entity_snapshots_entity_id", table_name="ppc_entity_snapshots")
    op.drop_index("ix_ppc_entity_snapshots_entity_type", table_name="ppc_entity_snapshots")
    op.drop_table("ppc_entity_snapshots")
