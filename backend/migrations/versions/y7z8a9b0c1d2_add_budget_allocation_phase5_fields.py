"""add budget allocation phase5 fields

Adds 14 columns to budget_allocations for Phase 5 intelligent allocation:
  recommended_{sp,sb,sd,sbv}_pct  — algorithm output
  {sp,sb,sd,sbv}_roas             — observed ROAS per ad type
  {sp,sb,sd,sbv}_utilization      — actual_spend / allocated_budget
  reasoning                        — JSON explaining decisions per type
  status                           — pending / applied / rejected

Revision ID: y7z8a9b0c1d2
Revises: x6y7z8a9b0c1
Create Date: 2026-03-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "y7z8a9b0c1d2"
down_revision = "x6y7z8a9b0c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Recommended allocation percentages (algorithm output)
    op.add_column("budget_allocations", sa.Column("recommended_sp_pct", sa.Float(), nullable=True))
    op.add_column("budget_allocations", sa.Column("recommended_sb_pct", sa.Float(), nullable=True))
    op.add_column("budget_allocations", sa.Column("recommended_sd_pct", sa.Float(), nullable=True))
    op.add_column("budget_allocations", sa.Column("recommended_sbv_pct", sa.Float(), nullable=True))
    # ROAS per ad type
    op.add_column("budget_allocations", sa.Column("sp_roas", sa.Float(), nullable=True))
    op.add_column("budget_allocations", sa.Column("sb_roas", sa.Float(), nullable=True))
    op.add_column("budget_allocations", sa.Column("sd_roas", sa.Float(), nullable=True))
    op.add_column("budget_allocations", sa.Column("sbv_roas", sa.Float(), nullable=True))
    # Budget utilization per ad type (0.0–1.0+)
    op.add_column("budget_allocations", sa.Column("sp_utilization", sa.Float(), nullable=True))
    op.add_column("budget_allocations", sa.Column("sb_utilization", sa.Float(), nullable=True))
    op.add_column("budget_allocations", sa.Column("sd_utilization", sa.Float(), nullable=True))
    op.add_column("budget_allocations", sa.Column("sbv_utilization", sa.Float(), nullable=True))
    # Reasoning JSON and workflow status
    op.add_column("budget_allocations", sa.Column("reasoning", sa.Text(), nullable=True))
    op.add_column("budget_allocations", sa.Column("status", sa.String(), nullable=False, server_default="pending"))


def downgrade() -> None:
    op.drop_column("budget_allocations", "status")
    op.drop_column("budget_allocations", "reasoning")
    op.drop_column("budget_allocations", "sbv_utilization")
    op.drop_column("budget_allocations", "sd_utilization")
    op.drop_column("budget_allocations", "sb_utilization")
    op.drop_column("budget_allocations", "sp_utilization")
    op.drop_column("budget_allocations", "sbv_roas")
    op.drop_column("budget_allocations", "sd_roas")
    op.drop_column("budget_allocations", "sb_roas")
    op.drop_column("budget_allocations", "sp_roas")
    op.drop_column("budget_allocations", "recommended_sbv_pct")
    op.drop_column("budget_allocations", "recommended_sd_pct")
    op.drop_column("budget_allocations", "recommended_sb_pct")
    op.drop_column("budget_allocations", "recommended_sp_pct")
