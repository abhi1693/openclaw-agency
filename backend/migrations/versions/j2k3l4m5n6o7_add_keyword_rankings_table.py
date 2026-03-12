"""add keyword_rankings table

Revision ID: j2k3l4m5n6o7
Revises: h1i2j3k4l5m6
Create Date: 2026-03-11 22:05:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "j2k3l4m5n6o7"
down_revision = "h1i2j3k4l5m6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "keyword_rankings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("asin", sa.String(), nullable=False, index=True),
        sa.Column("keyword", sa.String(), nullable=False, index=True),
        sa.Column("organic_rank", sa.Integer(), nullable=True),
        sa.Column("sponsored_rank", sa.Integer(), nullable=True),
        sa.Column("search_volume", sa.Integer(), nullable=True),
        sa.Column("search_volume_trend", sa.String(), nullable=True),
        sa.Column("click_share", sa.Float(), nullable=True),
        sa.Column("conversion_share", sa.Float(), nullable=True),
        sa.Column("cerebro_iq_score", sa.Float(), nullable=True),
        sa.Column("competing_products", sa.Integer(), nullable=True),
        sa.Column("sponsored_asins", sa.Integer(), nullable=True),
        sa.Column("suggested_ppc_bid", sa.Float(), nullable=True),
        sa.Column("title_density", sa.Integer(), nullable=True),
        sa.Column("cpr", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default="h10_cerebro"),
        sa.Column("snapshot_date", sa.Date(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("asin", "keyword", "snapshot_date", name="uq_keyword_ranking_identity"),
    )
    # Indexes are created inline via index=True on the columns above


def downgrade() -> None:
    op.drop_table("keyword_rankings")
