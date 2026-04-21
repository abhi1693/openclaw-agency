"""add keyword recommendation target_ad_group_id

Adds target_ad_group_id to keyword_recommendations so that add_keyword
proposals carry the canonical ad group ID required by the Amazon Ads API
(create_keyword requires campaign_id AND ad_group_id).

The discoverer leaves this null (search-term reports lack ad-group granularity).
UI or pre-approval workflow must resolve it before execution.

Revision ID: a1b2c3d4e5f6
Revises: z8a9b0c1d2e3
Create Date: 2026-04-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "z8a9b0c1d2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "keyword_recommendations",
        sa.Column("target_ad_group_id", sa.String(), nullable=True, index=True),
    )


def downgrade() -> None:
    op.drop_column("keyword_recommendations", "target_ad_group_id")
