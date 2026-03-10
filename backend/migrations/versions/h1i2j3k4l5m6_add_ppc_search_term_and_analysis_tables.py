"""Add search_term_reports and ppc_analysis_snapshots tables.

Revision ID: h1i2j3k4l5m6
Revises: g1h2i3j4k5l6
Create Date: 2026-03-10 12:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'h1i2j3k4l5m6'
down_revision = 'g1h2i3j4k5l6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'search_term_reports',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('search_term', sa.String(), nullable=False),
        sa.Column('campaign_id', sa.String(), nullable=True),
        sa.Column('campaign_name', sa.String(), nullable=True),
        sa.Column('ad_group_id', sa.String(), nullable=True),
        sa.Column('ad_group_name', sa.String(), nullable=True),
        sa.Column('keyword', sa.String(), nullable=True),
        sa.Column('match_type', sa.String(), nullable=True),
        sa.Column('impressions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('clicks', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('spend', sa.Numeric(12, 4), nullable=True),
        sa.Column('sales', sa.Numeric(12, 4), nullable=True),
        sa.Column('orders', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('units', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('acos', sa.Numeric(12, 6), nullable=True),
        sa.Column('roas', sa.Numeric(12, 6), nullable=True),
        sa.Column('ctr', sa.Numeric(12, 6), nullable=True),
        sa.Column('cpc', sa.Numeric(12, 6), nullable=True),
        sa.Column('report_date', sa.Date(), nullable=True),
        sa.Column('period', sa.String(), nullable=False),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'period', 'search_term', 'campaign_name', 'match_type', 'report_date',
            name='uq_search_term_reports_identity',
        ),
    )
    op.create_index('ix_search_term_reports_search_term', 'search_term_reports', ['search_term'])
    op.create_index('ix_search_term_reports_campaign_id', 'search_term_reports', ['campaign_id'])
    op.create_index('ix_search_term_reports_campaign_name', 'search_term_reports', ['campaign_name'])
    op.create_index('ix_search_term_reports_ad_group_id', 'search_term_reports', ['ad_group_id'])
    op.create_index('ix_search_term_reports_match_type', 'search_term_reports', ['match_type'])
    op.create_index('ix_search_term_reports_report_date', 'search_term_reports', ['report_date'])
    op.create_index('ix_search_term_reports_period', 'search_term_reports', ['period'])
    op.create_index('ix_search_term_reports_synced_at', 'search_term_reports', ['synced_at'])

    op.create_table(
        'ppc_analysis_snapshots',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('analysis_type', sa.String(), nullable=False),
        sa.Column('report_date', sa.Date(), nullable=False),
        sa.Column('period', sa.String(), nullable=True),
        sa.Column('data', sa.JSON(), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'analysis_type', 'report_date',
            name='uq_ppc_analysis_snapshots_type_date',
        ),
    )
    op.create_index('ix_ppc_analysis_snapshots_analysis_type', 'ppc_analysis_snapshots', ['analysis_type'])
    op.create_index('ix_ppc_analysis_snapshots_report_date', 'ppc_analysis_snapshots', ['report_date'])
    op.create_index('ix_ppc_analysis_snapshots_synced_at', 'ppc_analysis_snapshots', ['synced_at'])


def downgrade() -> None:
    op.drop_index('ix_ppc_analysis_snapshots_synced_at', table_name='ppc_analysis_snapshots')
    op.drop_index('ix_ppc_analysis_snapshots_report_date', table_name='ppc_analysis_snapshots')
    op.drop_index('ix_ppc_analysis_snapshots_analysis_type', table_name='ppc_analysis_snapshots')
    op.drop_table('ppc_analysis_snapshots')

    op.drop_index('ix_search_term_reports_synced_at', table_name='search_term_reports')
    op.drop_index('ix_search_term_reports_period', table_name='search_term_reports')
    op.drop_index('ix_search_term_reports_report_date', table_name='search_term_reports')
    op.drop_index('ix_search_term_reports_match_type', table_name='search_term_reports')
    op.drop_index('ix_search_term_reports_ad_group_id', table_name='search_term_reports')
    op.drop_index('ix_search_term_reports_campaign_name', table_name='search_term_reports')
    op.drop_index('ix_search_term_reports_campaign_id', table_name='search_term_reports')
    op.drop_index('ix_search_term_reports_search_term', table_name='search_term_reports')
    op.drop_table('search_term_reports')
