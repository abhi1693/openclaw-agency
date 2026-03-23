"""add keyword recommendations phase3 fields

Adds 5 columns to keyword_recommendations for Phase 3 enhanced discovery:
  confidence, source, evidence, match_type_recommendation, pattern_group

Revision ID: x6y7z8a9b0c1
Revises: w5x6y7z8a9b0
Create Date: 2026-03-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "x6y7z8a9b0c1"
down_revision = "w5x6y7z8a9b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("keyword_recommendations", sa.Column("confidence", sa.Float(), nullable=True))
    op.add_column("keyword_recommendations", sa.Column("source", sa.String(), nullable=True))
    op.add_column("keyword_recommendations", sa.Column("evidence", sa.Text(), nullable=True))
    op.add_column("keyword_recommendations", sa.Column("match_type_recommendation", sa.String(), nullable=True))
    op.add_column("keyword_recommendations", sa.Column("pattern_group", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("keyword_recommendations", "pattern_group")
    op.drop_column("keyword_recommendations", "match_type_recommendation")
    op.drop_column("keyword_recommendations", "evidence")
    op.drop_column("keyword_recommendations", "source")
    op.drop_column("keyword_recommendations", "confidence")
