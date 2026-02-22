"""add proactivity tables: agent_events, proactive_rules, agent_suggestions

Revision ID: m8a1b2c3d4e5
Revises: g2r1a2b3c4d5
Create Date: 2026-02-22 14:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "m8a1b2c3d4e5"
down_revision = "g2r1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # -- agent_events --
    if not inspector.has_table("agent_events"):
        op.create_table(
            "agent_events",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("board_id", sa.Uuid(), nullable=True),
            sa.Column("agent_id", sa.Uuid(), nullable=True),
            sa.Column("task_id", sa.Uuid(), nullable=True),
            sa.Column("event_type", sa.String(length=128), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
            sa.ForeignKeyConstraint(["agent_id"], ["agents.id"]),
            sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    ae_indexes = {item.get("name") for item in inspector.get_indexes("agent_events")}
    _create_index_if_missing(
        ae_indexes,
        "ix_agent_events_org_type",
        "agent_events",
        ["organization_id", "event_type"],
    )
    _create_index_if_missing(
        ae_indexes,
        "ix_agent_events_created",
        "agent_events",
        ["created_at"],
    )
    _create_index_if_missing(
        ae_indexes,
        "ix_agent_events_board_id",
        "agent_events",
        ["board_id"],
    )
    _create_index_if_missing(
        ae_indexes,
        "ix_agent_events_agent_id",
        "agent_events",
        ["agent_id"],
    )
    _create_index_if_missing(
        ae_indexes,
        "ix_agent_events_task_id",
        "agent_events",
        ["task_id"],
    )

    # -- proactive_rules --
    if not inspector.has_table("proactive_rules"):
        op.create_table(
            "proactive_rules",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("board_id", sa.Uuid(), nullable=True),
            sa.Column("name", sa.String(length=256), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("trigger_event", sa.String(length=128), nullable=False),
            sa.Column("conditions", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("action_type", sa.String(length=64), nullable=False),
            sa.Column("action_config", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("cooldown_seconds", sa.Integer(), nullable=False, server_default="3600"),
            sa.Column("last_fired_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    pr_indexes = {item.get("name") for item in inspector.get_indexes("proactive_rules")}
    _create_index_if_missing(
        pr_indexes,
        "ix_proactive_rules_org",
        "proactive_rules",
        ["organization_id", "is_enabled"],
    )
    _create_index_if_missing(
        pr_indexes,
        "ix_proactive_rules_trigger_event",
        "proactive_rules",
        ["trigger_event"],
    )
    _create_index_if_missing(
        pr_indexes,
        "ix_proactive_rules_board_id",
        "proactive_rules",
        ["board_id"],
    )

    # -- agent_suggestions --
    if not inspector.has_table("agent_suggestions"):
        op.create_table(
            "agent_suggestions",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("board_id", sa.Uuid(), nullable=True),
            sa.Column("agent_id", sa.Uuid(), nullable=True),
            sa.Column("suggestion_type", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=512), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column(
                "confidence", sa.Float(), nullable=False, server_default="0.5"
            ),
            sa.Column("priority", sa.String(length=32), nullable=False, server_default="medium"),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("source_event_id", sa.Uuid(), nullable=True),
            sa.Column("resolved_by_user_id", sa.Uuid(), nullable=True),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
            sa.ForeignKeyConstraint(["agent_id"], ["agents.id"]),
            sa.ForeignKeyConstraint(["source_event_id"], ["agent_events.id"]),
            sa.ForeignKeyConstraint(["resolved_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    as_indexes = {item.get("name") for item in inspector.get_indexes("agent_suggestions")}
    _create_index_if_missing(
        as_indexes,
        "ix_agent_suggestions_org_status",
        "agent_suggestions",
        ["organization_id", "status"],
    )
    _create_index_if_missing(
        as_indexes,
        "ix_agent_suggestions_board",
        "agent_suggestions",
        ["board_id"],
    )
    _create_index_if_missing(
        as_indexes,
        "ix_agent_suggestions_agent_id",
        "agent_suggestions",
        ["agent_id"],
    )
    _create_index_if_missing(
        as_indexes,
        "ix_agent_suggestions_status",
        "agent_suggestions",
        ["status"],
    )
    _create_index_if_missing(
        as_indexes,
        "ix_agent_suggestions_source_event_id",
        "agent_suggestions",
        ["source_event_id"],
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
    op.drop_index("ix_agent_suggestions_source_event_id", table_name="agent_suggestions")
    op.drop_index("ix_agent_suggestions_status", table_name="agent_suggestions")
    op.drop_index("ix_agent_suggestions_agent_id", table_name="agent_suggestions")
    op.drop_index("ix_agent_suggestions_board", table_name="agent_suggestions")
    op.drop_index("ix_agent_suggestions_org_status", table_name="agent_suggestions")
    op.drop_table("agent_suggestions")

    op.drop_index("ix_proactive_rules_board_id", table_name="proactive_rules")
    op.drop_index("ix_proactive_rules_trigger_event", table_name="proactive_rules")
    op.drop_index("ix_proactive_rules_org", table_name="proactive_rules")
    op.drop_table("proactive_rules")

    op.drop_index("ix_agent_events_task_id", table_name="agent_events")
    op.drop_index("ix_agent_events_agent_id", table_name="agent_events")
    op.drop_index("ix_agent_events_board_id", table_name="agent_events")
    op.drop_index("ix_agent_events_created", table_name="agent_events")
    op.drop_index("ix_agent_events_org_type", table_name="agent_events")
    op.drop_table("agent_events")
