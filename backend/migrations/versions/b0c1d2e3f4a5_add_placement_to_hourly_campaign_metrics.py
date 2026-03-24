"""add placement to hourly_campaign_metrics

Revision ID: a9b0c1d2e3f4
Revises: z8a9b0c1d2e3
Create Date: 2026-03-23

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = 'b0c1d2e3f4a5'
down_revision = 'a9b0c1d2e3f4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'hourly_campaign_metrics',
        sa.Column('placement', sa.String(), nullable=True),
    )
    op.create_index(
        'ix_hourly_campaign_metrics_placement',
        'hourly_campaign_metrics',
        ['placement'],
    )


def downgrade() -> None:
    op.drop_index('ix_hourly_campaign_metrics_placement', table_name='hourly_campaign_metrics')
    op.drop_column('hourly_campaign_metrics', 'placement')
