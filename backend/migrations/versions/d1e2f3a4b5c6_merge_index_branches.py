"""Merge orphaned index branches (99cd6df95f85, b4338be78eec) with main chain (c7e4f2a9b1d3).

Both index branches branched off f4d2b649e93a and were never stamped in the DB.
This merge migration makes the tree single-headed so `alembic upgrade head` works
reliably on any fresh database.  The two index migrations have been made idempotent
(CREATE INDEX IF NOT EXISTS) so they apply safely to DBs where the indexes were
already created outside of Alembic.

Revision ID: d1e2f3a4b5c6
Revises: c7e4f2a9b1d3, 99cd6df95f85, b4338be78eec
Create Date: 2026-06-10
"""

from __future__ import annotations

# revision identifiers, used by Alembic.
revision = "d1e2f3a4b5c6"
down_revision = ("c7e4f2a9b1d3", "99cd6df95f85", "b4338be78eec")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Pure merge point — no schema changes needed.
    pass


def downgrade() -> None:
    # Pure merge point — no schema changes to revert.
    pass
