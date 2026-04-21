"""add ppc execution tables

Creates:
  - ppc_proposal_executions table  (idempotency-keyed proposal execution tracking)
  - ppc_execution_items table       (per-recommendation execution outcomes)

Revision ID: j9k0l1m2n3o4
Revises: i8j9k0l1m2n3
Create Date: 2026-04-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "j9k0l1m2n3o4"
down_revision = "i8j9k0l1m2n3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ppc_proposal_executions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("proposal_id", sa.UUID(), nullable=False),
        sa.Column("idempotency_key", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("triggered_by", sa.String(), nullable=False, server_default="system"),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("items_total", sa.Integer(), nullable=True),
        sa.Column("items_applied", sa.Integer(), nullable=True),
        sa.Column("items_failed", sa.Integer(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column(
            "metadata_json",
            sa.JSON(),
            nullable=True,
            server_default="null",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ppc_proposal_executions_proposal_id", "ppc_proposal_executions", ["proposal_id"]
    )
    op.create_index(
        "ix_ppc_proposal_executions_idempotency_key",
        "ppc_proposal_executions",
        ["idempotency_key"],
    )
    op.create_index(
        "ix_ppc_proposal_executions_status", "ppc_proposal_executions", ["status"]
    )
    op.create_index(
        "ix_ppc_proposal_executions_started_at",
        "ppc_proposal_executions",
        ["started_at"],
    )
    op.create_unique_constraint(
        "uq_ppc_proposal_executions_proposal_idempotency",
        "ppc_proposal_executions",
        ["proposal_id", "idempotency_key"],
    )

    op.create_table(
        "ppc_execution_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("execution_id", sa.UUID(), nullable=False),
        sa.Column("proposal_item_id", sa.UUID(), nullable=False),
        sa.Column("recommendation_type", sa.String(), nullable=False),
        sa.Column("recommendation_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("attempt", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ppc_execution_items_execution_id", "ppc_execution_items", ["execution_id"]
    )
    op.create_index(
        "ix_ppc_execution_items_proposal_item_id",
        "ppc_execution_items",
        ["proposal_item_id"],
    )
    op.create_index(
        "ix_ppc_execution_items_recommendation_type",
        "ppc_execution_items",
        ["recommendation_type"],
    )
    op.create_index(
        "ix_ppc_execution_items_recommendation_id",
        "ppc_execution_items",
        ["recommendation_id"],
    )
    op.create_index(
        "ix_ppc_execution_items_status", "ppc_execution_items", ["status"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_ppc_execution_items_status", table_name="ppc_execution_items"
    )
    op.drop_index(
        "ix_ppc_execution_items_recommendation_id", table_name="ppc_execution_items"
    )
    op.drop_index(
        "ix_ppc_execution_items_recommendation_type",
        table_name="ppc_execution_items",
    )
    op.drop_index(
        "ix_ppc_execution_items_proposal_item_id", table_name="ppc_execution_items"
    )
    op.drop_index(
        "ix_ppc_execution_items_execution_id", table_name="ppc_execution_items"
    )
    op.drop_table("ppc_execution_items")

    op.drop_constraint(
        "uq_ppc_proposal_executions_proposal_idempotency",
        "ppc_proposal_executions",
        type_="unique",
    )
    op.drop_index(
        "ix_ppc_proposal_executions_started_at", "ppc_proposal_executions"
    )
    op.drop_index(
        "ix_ppc_proposal_executions_status", "ppc_proposal_executions"
    )
    op.drop_index(
        "ix_ppc_proposal_executions_idempotency_key",
        "ppc_proposal_executions",
    )
    op.drop_index(
        "ix_ppc_proposal_executions_proposal_id", "ppc_proposal_executions"
    )
    op.drop_table("ppc_proposal_executions")
