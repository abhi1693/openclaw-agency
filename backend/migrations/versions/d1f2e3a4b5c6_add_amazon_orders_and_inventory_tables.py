"""Add amazon orders and inventory tables.

Revision ID: d1f2e3a4b5c6
Revises: a9b1c2d3e4f7
Create Date: 2026-03-10 09:30:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'd1f2e3a4b5c6'
down_revision = 'a9b1c2d3e4f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'amazon_orders',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('amazon_order_id', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('purchase_date', sa.DateTime(), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('currency', sa.String(), nullable=True),
        sa.Column('item_count', sa.Integer(), nullable=False),
        sa.Column('fulfillment', sa.String(), nullable=True),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('amazon_order_id'),
    )
    op.create_index('ix_amazon_orders_amazon_order_id', 'amazon_orders', ['amazon_order_id'])
    op.create_index('ix_amazon_orders_purchase_date', 'amazon_orders', ['purchase_date'])
    op.create_index('ix_amazon_orders_status', 'amazon_orders', ['status'])
    op.create_index('ix_amazon_orders_synced_at', 'amazon_orders', ['synced_at'])

    op.create_table(
        'amazon_order_items',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('order_id', sa.Uuid(), nullable=False),
        sa.Column('asin', sa.String(), nullable=True),
        sa.Column('sku', sa.String(), nullable=True),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('quantity_ordered', sa.Integer(), nullable=False),
        sa.Column('quantity_shipped', sa.Integer(), nullable=False),
        sa.Column('item_price', sa.Numeric(12, 2), nullable=True),
        sa.Column('item_tax', sa.Numeric(12, 2), nullable=True),
        sa.Column('promo_discount', sa.Numeric(12, 2), nullable=True),
        sa.Column('currency', sa.String(), nullable=True),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['order_id'], ['amazon_orders.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('order_id', 'sku', 'asin', 'title', name='uq_amazon_order_items_identity'),
    )
    op.create_index('ix_amazon_order_items_order_id', 'amazon_order_items', ['order_id'])
    op.create_index('ix_amazon_order_items_asin', 'amazon_order_items', ['asin'])
    op.create_index('ix_amazon_order_items_sku', 'amazon_order_items', ['sku'])
    op.create_index('ix_amazon_order_items_synced_at', 'amazon_order_items', ['synced_at'])

    op.create_table(
        'inventory_snapshots',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('sku', sa.String(), nullable=False),
        sa.Column('asin', sa.String(), nullable=True),
        sa.Column('fn_sku', sa.String(), nullable=True),
        sa.Column('condition', sa.String(), nullable=True),
        sa.Column('available', sa.Integer(), nullable=False),
        sa.Column('inbound', sa.Integer(), nullable=False),
        sa.Column('reserved', sa.Integer(), nullable=False),
        sa.Column('total_supply', sa.Integer(), nullable=False),
        sa.Column('product_name', sa.String(), nullable=True),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sku'),
    )
    op.create_index('ix_inventory_snapshots_sku', 'inventory_snapshots', ['sku'])
    op.create_index('ix_inventory_snapshots_asin', 'inventory_snapshots', ['asin'])
    op.create_index('ix_inventory_snapshots_synced_at', 'inventory_snapshots', ['synced_at'])
    op.create_index('ix_inventory_snapshots_total_supply', 'inventory_snapshots', ['total_supply'])


def downgrade() -> None:
    op.drop_table('inventory_snapshots')
    op.drop_table('amazon_order_items')
    op.drop_table('amazon_orders')
