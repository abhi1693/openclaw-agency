"""add h5_chat_sessions table for WebSocket relay (M4)

Revision ID: m4a1b2c3d4e5
Revises: m8a1b2c3d4e5
Create Date: 2026-02-22 16:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "m4a1b2c3d4e5"
down_revision = "m8a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # -- h5_chat_sessions --
    if not inspector.has_table("h5_chat_sessions"):
        op.create_table(
            "h5_chat_sessions",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("h5_user_id", sa.Uuid(), nullable=False),
            sa.Column("agent_id", sa.Uuid(), nullable=False),
            sa.Column("gateway_id", sa.Uuid(), nullable=False),
            sa.Column("session_key", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("last_message_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["h5_user_id"],
                ["h5_users.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(["agent_id"], ["agents.id"]),
            sa.ForeignKeyConstraint(["gateway_id"], ["gateways.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    sessions_indexes = {item.get("name") for item in inspector.get_indexes("h5_chat_sessions")}
    if "ix_h5_chat_sessions_user" not in sessions_indexes:
        op.create_index(
            "ix_h5_chat_sessions_user",
            "h5_chat_sessions",
            ["h5_user_id", "status"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index("ix_h5_chat_sessions_user", table_name="h5_chat_sessions")
    op.drop_table("h5_chat_sessions")
