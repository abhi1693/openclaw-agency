"""add traffic_daily table

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-03-24 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = 'c1d2e3f4a5b6'
down_revision = 'b0c1d2e3f4a5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'traffic_daily',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('report_date', sa.Date(), nullable=False),
        sa.Column('asin', sa.String(), nullable=True),
        sa.Column('sessions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('page_views', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('buy_box_pct', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('unit_session_pct', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('units_ordered', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('ordered_product_sales', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('report_date', 'asin', name='uq_traffic_daily_date_asin'),
    )
    op.create_index('ix_traffic_daily_report_date', 'traffic_daily', ['report_date'])
    op.create_index('ix_traffic_daily_asin', 'traffic_daily', ['asin'])


def downgrade() -> None:
    op.drop_index('ix_traffic_daily_asin', table_name='traffic_daily')
    op.drop_index('ix_traffic_daily_report_date', table_name='traffic_daily')
    op.drop_table('traffic_daily')
