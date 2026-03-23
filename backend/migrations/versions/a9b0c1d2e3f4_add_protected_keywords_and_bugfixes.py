"""add protected_keywords to ppc_automation_settings; delete sanitizer false-positive

Revision ID: a9b0c1d2e3f4
Revises: z8a9b0c1d2e3
Create Date: 2026-03-23

Changes:
  1. Add protected_keywords (TEXT) to ppc_automation_settings — JSON array of
     root words that the negative pattern detector will never recommend as negatives.
  2. Delete the false-positive "sanitizer" negative recommendation created when
     there was only 1 day of search term data.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a9b0c1d2e3f4"
down_revision = "z8a9b0c1d2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add protected_keywords column
    op.add_column(
        "ppc_automation_settings",
        sa.Column("protected_keywords", sa.Text(), nullable=True),
    )

    # Delete the false-positive sanitizer pattern recommendation
    op.execute(
        """
        DELETE FROM keyword_recommendations
        WHERE source = 'pattern_detector'
          AND pattern_group = 'sanitizer'
        """
    )

    # Also delete any other pattern detector recs from single-day data
    # (safe: they'll be regenerated once enough data accumulates)
    op.execute(
        """
        DELETE FROM keyword_recommendations
        WHERE source = 'pattern_detector'
          AND status = 'pending'
        """
    )


def downgrade() -> None:
    op.drop_column("ppc_automation_settings", "protected_keywords")
