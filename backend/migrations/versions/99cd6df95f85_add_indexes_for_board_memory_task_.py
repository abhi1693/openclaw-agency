"""add indexes for board memory + task comments

Revision ID: 99cd6df95f85
Revises: f4d2b649e93a
Create Date: 2026-02-12 08:13:19.786621

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '99cd6df95f85'
down_revision = 'f4d2b649e93a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Board memory lists filter on (board_id, is_chat) and order by created_at desc.
    # IF NOT EXISTS: these indexes may already exist from manual creation or a prior
    # migration run; using raw SQL makes this migration idempotent.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_board_memory_board_id_is_chat_created_at"
        " ON board_memory (board_id, is_chat, created_at)"
    )

    # Task comments are stored as ActivityEvent rows with event_type='task.comment'.
    # Listing comments uses task_id + created_at ordering.
    op.execute(
        "CREATE INDEX IF NOT EXISTS"
        " ix_activity_events_task_comment_task_id_created_at"
        " ON activity_events (task_id, created_at)"
        " WHERE event_type = 'task.comment'"
    )


def downgrade() -> None:
    op.drop_index(
        "ix_activity_events_task_comment_task_id_created_at",
        table_name="activity_events",
    )
    op.drop_index(
        "ix_board_memory_board_id_is_chat_created_at",
        table_name="board_memory",
    )
