"""add team tables: agent_teams, agent_team_members, agent_capabilities

Revision ID: m13a1b2c3d4e5
Revises: m4a1b2c3d4e5
Create Date: 2026-02-23 10:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "m13a1b2c3d4e5"
down_revision = "m4a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # -- agent_teams --
    if not inspector.has_table("agent_teams"):
        op.create_table(
            "agent_teams",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("board_id", sa.Uuid(), nullable=True),
            sa.Column("name", sa.String(length=256), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("team_type", sa.String(length=64), nullable=False, server_default="custom"),
            sa.Column("config", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    at_indexes = {item.get("name") for item in inspector.get_indexes("agent_teams")}
    _create_index_if_missing(
        at_indexes,
        "ix_agent_teams_org",
        "agent_teams",
        ["organization_id"],
    )
    _create_index_if_missing(
        at_indexes,
        "ix_agent_teams_board_id",
        "agent_teams",
        ["board_id"],
    )

    # -- agent_team_members --
    if not inspector.has_table("agent_team_members"):
        op.create_table(
            "agent_team_members",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("team_id", sa.Uuid(), nullable=False),
            sa.Column("agent_id", sa.Uuid(), nullable=False),
            sa.Column(
                "role_in_team", sa.String(length=64), nullable=False, server_default="member"
            ),
            sa.Column("capabilities", sa.JSON(), nullable=True, server_default="[]"),
            sa.Column("joined_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["team_id"], ["agent_teams.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("team_id", "agent_id", name="uq_agent_team_members_team_agent"),
        )
    atm_indexes = {item.get("name") for item in inspector.get_indexes("agent_team_members")}
    _create_index_if_missing(
        atm_indexes,
        "ix_agent_team_members_agent",
        "agent_team_members",
        ["agent_id"],
    )
    _create_index_if_missing(
        atm_indexes,
        "ix_agent_team_members_team_id",
        "agent_team_members",
        ["team_id"],
    )

    # -- agent_capabilities --
    if not inspector.has_table("agent_capabilities"):
        op.create_table(
            "agent_capabilities",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("agent_id", sa.Uuid(), nullable=False),
            sa.Column("capability", sa.String(length=128), nullable=False),
            sa.Column(
                "proficiency", sa.String(length=32), nullable=False, server_default="standard"
            ),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "agent_id", "capability", name="uq_agent_capabilities_agent_capability"
            ),
        )
    ac_indexes = {item.get("name") for item in inspector.get_indexes("agent_capabilities")}
    _create_index_if_missing(
        ac_indexes,
        "ix_agent_capabilities_org",
        "agent_capabilities",
        ["organization_id", "capability"],
    )
    _create_index_if_missing(
        ac_indexes,
        "ix_agent_capabilities_agent_id",
        "agent_capabilities",
        ["agent_id"],
    )


def _create_index_if_missing(
    existing: set,
    name: str,
    table: str,
    columns: list[str],
    unique: bool = False,
) -> None:
    if name not in existing:
        op.create_index(name, table, columns, unique=unique)


def downgrade() -> None:
    op.drop_index("ix_agent_capabilities_agent_id", table_name="agent_capabilities")
    op.drop_index("ix_agent_capabilities_org", table_name="agent_capabilities")
    op.drop_table("agent_capabilities")

    op.drop_index("ix_agent_team_members_team_id", table_name="agent_team_members")
    op.drop_index("ix_agent_team_members_agent", table_name="agent_team_members")
    op.drop_table("agent_team_members")

    op.drop_index("ix_agent_teams_board_id", table_name="agent_teams")
    op.drop_index("ix_agent_teams_org", table_name="agent_teams")
    op.drop_table("agent_teams")
