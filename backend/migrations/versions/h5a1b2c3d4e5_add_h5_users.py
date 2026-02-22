"""add h5 users, refresh tokens, and agent assignments

Revision ID: h5a1b2c3d4e5
Revises: b6f4c7d9e1a2, b7a1d9c3e4f5, a1e6b0d62f0c, f4d2b649e93a
Create Date: 2026-02-22 12:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "h5a1b2c3d4e5"
down_revision = ("b6f4c7d9e1a2", "b7a1d9c3e4f5", "a1e6b0d62f0c", "f4d2b649e93a")
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # -- h5_users --
    if not inspector.has_table("h5_users"):
        op.create_table(
            "h5_users",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("username", sa.String(length=64), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("phone", sa.String(length=32), nullable=True),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column("display_name", sa.String(length=128), nullable=True),
            sa.Column("avatar_url", sa.String(length=512), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("last_login_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "organization_id",
                "username",
                name="uq_h5_users_org_username",
            ),
        )
    h5_users_indexes = {item.get("name") for item in inspector.get_indexes("h5_users")}
    if op.f("ix_h5_users_organization_id") not in h5_users_indexes:
        op.create_index(
            op.f("ix_h5_users_organization_id"),
            "h5_users",
            ["organization_id"],
            unique=False,
        )
    if op.f("ix_h5_users_username") not in h5_users_indexes:
        op.create_index(
            op.f("ix_h5_users_username"),
            "h5_users",
            ["username"],
            unique=False,
        )
    if op.f("ix_h5_users_status") not in h5_users_indexes:
        op.create_index(
            op.f("ix_h5_users_status"),
            "h5_users",
            ["status"],
            unique=False,
        )

    # -- h5_refresh_tokens --
    if not inspector.has_table("h5_refresh_tokens"):
        op.create_table(
            "h5_refresh_tokens",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("h5_user_id", sa.Uuid(), nullable=False),
            sa.Column("token_hash", sa.String(length=255), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("revoked", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["h5_user_id"],
                ["h5_users.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("token_hash", name="uq_h5_refresh_tokens_token_hash"),
        )
    rt_indexes = {item.get("name") for item in inspector.get_indexes("h5_refresh_tokens")}
    if op.f("ix_h5_refresh_tokens_h5_user_id") not in rt_indexes:
        op.create_index(
            op.f("ix_h5_refresh_tokens_h5_user_id"),
            "h5_refresh_tokens",
            ["h5_user_id"],
            unique=False,
        )

    # -- h5_user_agent_assignments --
    if not inspector.has_table("h5_user_agent_assignments"):
        op.create_table(
            "h5_user_agent_assignments",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("h5_user_id", sa.Uuid(), nullable=False),
            sa.Column("agent_id", sa.Uuid(), nullable=False),
            sa.Column("board_id", sa.Uuid(), nullable=False),
            sa.Column("role", sa.String(length=32), nullable=False),
            sa.Column("assigned_at", sa.DateTime(), nullable=False),
            sa.Column("assigned_by", sa.Uuid(), nullable=True),
            sa.ForeignKeyConstraint(
                ["h5_user_id"],
                ["h5_users.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
            sa.ForeignKeyConstraint(["assigned_by"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "h5_user_id",
                "agent_id",
                name="uq_h5_assign_user_agent",
            ),
        )
    assign_indexes = {
        item.get("name") for item in inspector.get_indexes("h5_user_agent_assignments")
    }
    if op.f("ix_h5_user_agent_assignments_h5_user_id") not in assign_indexes:
        op.create_index(
            op.f("ix_h5_user_agent_assignments_h5_user_id"),
            "h5_user_agent_assignments",
            ["h5_user_id"],
            unique=False,
        )
    if op.f("ix_h5_user_agent_assignments_agent_id") not in assign_indexes:
        op.create_index(
            op.f("ix_h5_user_agent_assignments_agent_id"),
            "h5_user_agent_assignments",
            ["agent_id"],
            unique=False,
        )
    if op.f("ix_h5_user_agent_assignments_board_id") not in assign_indexes:
        op.create_index(
            op.f("ix_h5_user_agent_assignments_board_id"),
            "h5_user_agent_assignments",
            ["board_id"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_h5_user_agent_assignments_board_id"),
        table_name="h5_user_agent_assignments",
    )
    op.drop_index(
        op.f("ix_h5_user_agent_assignments_agent_id"),
        table_name="h5_user_agent_assignments",
    )
    op.drop_index(
        op.f("ix_h5_user_agent_assignments_h5_user_id"),
        table_name="h5_user_agent_assignments",
    )
    op.drop_table("h5_user_agent_assignments")
    op.drop_index(
        op.f("ix_h5_refresh_tokens_h5_user_id"),
        table_name="h5_refresh_tokens",
    )
    op.drop_table("h5_refresh_tokens")
    op.drop_index(op.f("ix_h5_users_status"), table_name="h5_users")
    op.drop_index(op.f("ix_h5_users_username"), table_name="h5_users")
    op.drop_index(op.f("ix_h5_users_organization_id"), table_name="h5_users")
    op.drop_table("h5_users")
