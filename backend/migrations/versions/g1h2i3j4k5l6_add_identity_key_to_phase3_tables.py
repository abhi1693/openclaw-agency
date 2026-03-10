"""Add identity_key columns to amazon phase 3 tables.

Revision ID: g1h2i3j4k5l6
Revises: e7f8g9h0i1j2
Create Date: 2026-03-10 11:05:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'g1h2i3j4k5l6'
down_revision = 'e7f8g9h0i1j2'
branch_labels = None
depends_on = None


TABLES = [
    'product_sales',
    'financial_events',
    'ad_metrics',
    'pricing_snapshots',
    'return_events',
]


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column('identity_key', sa.String(), nullable=True, server_default=''))
        op.execute(f"UPDATE {table} SET identity_key = id::text WHERE identity_key = '' OR identity_key IS NULL")
        op.alter_column(table, 'identity_key', nullable=False, server_default=None)
        op.create_unique_constraint(f'uq_{table}_identity_key', table, ['identity_key'])
        op.create_index(f'ix_{table}_identity_key', table, ['identity_key'])


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_index(f'ix_{table}_identity_key', table_name=table)
        op.drop_constraint(f'uq_{table}_identity_key', table, type_='unique')
        op.drop_column(table, 'identity_key')
