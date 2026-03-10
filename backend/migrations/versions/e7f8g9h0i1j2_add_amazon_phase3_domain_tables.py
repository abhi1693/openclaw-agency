"""Add amazon phase 3 domain tables.

Revision ID: e7f8g9h0i1j2
Revises: d1f2e3a4b5c6
Create Date: 2026-03-10 10:10:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'e7f8g9h0i1j2'
down_revision = 'd1f2e3a4b5c6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'daily_sales',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('sales_date', sa.Date(), nullable=False),
        sa.Column('interval', sa.String(), nullable=False),
        sa.Column('order_count', sa.Integer(), nullable=False),
        sa.Column('order_item_count', sa.Integer(), nullable=False),
        sa.Column('unit_count', sa.Integer(), nullable=False),
        sa.Column('average_unit_price', sa.Numeric(12, 2), nullable=True),
        sa.Column('total_sales', sa.Numeric(12, 2), nullable=True),
        sa.Column('currency', sa.String(), nullable=True),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('interval'),
    )
    op.create_index('ix_daily_sales_sales_date', 'daily_sales', ['sales_date'])
    op.create_index('ix_daily_sales_interval', 'daily_sales', ['interval'])
    op.create_index('ix_daily_sales_synced_at', 'daily_sales', ['synced_at'])

    op.create_table(
        'product_sales',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('period', sa.String(), nullable=False),
        sa.Column('sku', sa.String(), nullable=True),
        sa.Column('asin', sa.String(), nullable=True),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('quantity_sold', sa.Integer(), nullable=False),
        sa.Column('order_count', sa.Integer(), nullable=False),
        sa.Column('revenue', sa.Numeric(12, 2), nullable=True),
        sa.Column('currency', sa.String(), nullable=True),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_product_sales_period', 'product_sales', ['period'])
    op.create_index('ix_product_sales_sku', 'product_sales', ['sku'])
    op.create_index('ix_product_sales_asin', 'product_sales', ['asin'])
    op.create_index('ix_product_sales_synced_at', 'product_sales', ['synced_at'])

    op.create_table(
        'financial_events',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('period', sa.String(), nullable=False),
        sa.Column('event_group', sa.String(), nullable=False),
        sa.Column('reference_id', sa.String(), nullable=True),
        sa.Column('posted_date', sa.DateTime(), nullable=True),
        sa.Column('sku', sa.String(), nullable=True),
        sa.Column('amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('currency', sa.String(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_financial_events_period', 'financial_events', ['period'])
    op.create_index('ix_financial_events_event_group', 'financial_events', ['event_group'])
    op.create_index('ix_financial_events_reference_id', 'financial_events', ['reference_id'])
    op.create_index('ix_financial_events_posted_date', 'financial_events', ['posted_date'])
    op.create_index('ix_financial_events_sku', 'financial_events', ['sku'])
    op.create_index('ix_financial_events_synced_at', 'financial_events', ['synced_at'])

    op.create_table(
        'campaigns',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('campaign_id', sa.String(), nullable=False),
        sa.Column('campaign_type', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('state', sa.String(), nullable=True),
        sa.Column('targeting_type', sa.String(), nullable=True),
        sa.Column('budget_amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('budget_type', sa.String(), nullable=True),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('campaign_id'),
    )
    op.create_index('ix_campaigns_campaign_id', 'campaigns', ['campaign_id'])
    op.create_index('ix_campaigns_campaign_type', 'campaigns', ['campaign_type'])
    op.create_index('ix_campaigns_name', 'campaigns', ['name'])
    op.create_index('ix_campaigns_state', 'campaigns', ['state'])
    op.create_index('ix_campaigns_start_date', 'campaigns', ['start_date'])
    op.create_index('ix_campaigns_end_date', 'campaigns', ['end_date'])
    op.create_index('ix_campaigns_synced_at', 'campaigns', ['synced_at'])

    op.create_table(
        'ad_metrics',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('campaign_id', sa.String(), nullable=False),
        sa.Column('period', sa.String(), nullable=False),
        sa.Column('report_date', sa.Date(), nullable=True),
        sa.Column('spend', sa.Numeric(12, 2), nullable=True),
        sa.Column('sales', sa.Numeric(12, 2), nullable=True),
        sa.Column('impressions', sa.Integer(), nullable=False),
        sa.Column('clicks', sa.Integer(), nullable=False),
        sa.Column('orders', sa.Integer(), nullable=False),
        sa.Column('units', sa.Integer(), nullable=False),
        sa.Column('ctr', sa.Numeric(8, 4), nullable=True),
        sa.Column('cpc', sa.Numeric(12, 4), nullable=True),
        sa.Column('acos', sa.Numeric(8, 4), nullable=True),
        sa.Column('roas', sa.Numeric(12, 4), nullable=True),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ad_metrics_campaign_id', 'ad_metrics', ['campaign_id'])
    op.create_index('ix_ad_metrics_period', 'ad_metrics', ['period'])
    op.create_index('ix_ad_metrics_report_date', 'ad_metrics', ['report_date'])
    op.create_index('ix_ad_metrics_synced_at', 'ad_metrics', ['synced_at'])

    op.create_table(
        'pricing_snapshots',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('period', sa.String(), nullable=False),
        sa.Column('asin', sa.String(), nullable=True),
        sa.Column('sku', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('price', sa.Numeric(12, 2), nullable=True),
        sa.Column('currency', sa.String(), nullable=True),
        sa.Column('change_amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('change_percent', sa.Numeric(8, 2), nullable=True),
        sa.Column('competitor_offers', sa.Integer(), nullable=False),
        sa.Column('buy_box_winner', sa.Boolean(), nullable=True),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_pricing_snapshots_period', 'pricing_snapshots', ['period'])
    op.create_index('ix_pricing_snapshots_asin', 'pricing_snapshots', ['asin'])
    op.create_index('ix_pricing_snapshots_sku', 'pricing_snapshots', ['sku'])
    op.create_index('ix_pricing_snapshots_status', 'pricing_snapshots', ['status'])
    op.create_index('ix_pricing_snapshots_synced_at', 'pricing_snapshots', ['synced_at'])

    op.create_table(
        'return_events',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('period', sa.String(), nullable=False),
        sa.Column('order_id', sa.String(), nullable=True),
        sa.Column('sku', sa.String(), nullable=True),
        sa.Column('reason', sa.String(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('event_date', sa.DateTime(), nullable=True),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_return_events_period', 'return_events', ['period'])
    op.create_index('ix_return_events_order_id', 'return_events', ['order_id'])
    op.create_index('ix_return_events_sku', 'return_events', ['sku'])
    op.create_index('ix_return_events_reason', 'return_events', ['reason'])
    op.create_index('ix_return_events_status', 'return_events', ['status'])
    op.create_index('ix_return_events_event_date', 'return_events', ['event_date'])
    op.create_index('ix_return_events_synced_at', 'return_events', ['synced_at'])


def downgrade() -> None:
    op.drop_table('return_events')
    op.drop_table('pricing_snapshots')
    op.drop_table('ad_metrics')
    op.drop_table('campaigns')
    op.drop_table('financial_events')
    op.drop_table('product_sales')
    op.drop_table('daily_sales')
