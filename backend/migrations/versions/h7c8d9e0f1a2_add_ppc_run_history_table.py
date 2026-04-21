"""add ppc_run_history table

Creates:
  - ppc_run_history table

Revision ID: h7c8d9e0f1a2
Revises: g6b7c8d9e0f1
Create Date: 2026-04-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "h7c8d9e0f1a2"
down_revision = "g6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ppc_run_history",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("run_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("triggered_by", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("entities_scanned", sa.Integer(), nullable=True),
        sa.Column("entities_created", sa.Integer(), nullable=True),
        sa.Column("entities_updated", sa.Integer(), nullable=True),
        sa.Column("errors", sa.Integer(), nullable=True),
        sa.Column("error_detail", sa.String(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ppc_run_history_run_type", "ppc_run_history", ["run_type"])
    op.create_index("ix_ppc_run_history_status", "ppc_run_history", ["status"])
    op.create_index("ix_ppc_run_history_started_at", "ppc_run_history", ["started_at"])


def downgrade() -> None:
    op.drop_index("ix_ppc_run_history_started_at", table_name="ppc_run_history")
    op.drop_index("ix_ppc_run_history_status", table_name="ppc_run_history")
    op.drop_index("ix_ppc_run_history_run_type", table_name="ppc_run_history")
    op.drop_table("ppc_run_history")
