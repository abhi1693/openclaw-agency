"""add calendar tables: calendar_events, task_schedules

Revision ID: m11a1b2c3d4e5
Revises: m8a1b2c3d4e5
Create Date: 2026-02-23 10:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "m11a1b2c3d4e5"
down_revision = "m8a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # -- calendar_events --
    if not inspector.has_table("calendar_events"):
        op.create_table(
            "calendar_events",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("board_id", sa.Uuid(), nullable=True),
            sa.Column("title", sa.String(length=512), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column(
                "event_type",
                sa.String(length=64),
                nullable=False,
                server_default="milestone",
            ),
            sa.Column("starts_at", sa.DateTime(), nullable=False),
            sa.Column("ends_at", sa.DateTime(), nullable=True),
            sa.Column("is_all_day", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("recurrence_rule", sa.String(length=256), nullable=True),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    ce_indexes = {item.get("name") for item in inspector.get_indexes("calendar_events")}
    _create_index_if_missing(
        ce_indexes,
        "ix_calendar_events_org_range",
        "calendar_events",
        ["organization_id", "starts_at", "ends_at"],
    )
    _create_index_if_missing(
        ce_indexes,
        "ix_calendar_events_board_id",
        "calendar_events",
        ["board_id"],
    )
    _create_index_if_missing(
        ce_indexes,
        "ix_calendar_events_event_type",
        "calendar_events",
        ["event_type"],
    )

    # -- task_schedules --
    if not inspector.has_table("task_schedules"):
        op.create_table(
            "task_schedules",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("task_id", sa.Uuid(), nullable=False),
            sa.Column("agent_id", sa.Uuid(), nullable=True),
            sa.Column("board_id", sa.Uuid(), nullable=False),
            sa.Column("scheduled_start", sa.DateTime(), nullable=False),
            sa.Column("scheduled_end", sa.DateTime(), nullable=False),
            sa.Column("actual_start", sa.DateTime(), nullable=True),
            sa.Column("actual_end", sa.DateTime(), nullable=True),
            sa.Column(
                "status",
                sa.String(length=32),
                nullable=False,
                server_default="planned",
            ),
            sa.Column("estimated_hours", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.CheckConstraint(
                "scheduled_end > scheduled_start", name="ck_schedule_range"
            ),
            sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["agent_id"], ["agents.id"]),
            sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    ts_indexes = {item.get("name") for item in inspector.get_indexes("task_schedules")}
    _create_index_if_missing(
        ts_indexes,
        "ix_task_schedules_agent_range",
        "task_schedules",
        ["agent_id", "scheduled_start", "scheduled_end"],
    )
    _create_index_if_missing(
        ts_indexes,
        "ix_task_schedules_board",
        "task_schedules",
        ["board_id"],
    )
    _create_index_if_missing(
        ts_indexes,
        "ix_task_schedules_task_id",
        "task_schedules",
        ["task_id"],
    )
    _create_index_if_missing(
        ts_indexes,
        "ix_task_schedules_status",
        "task_schedules",
        ["status"],
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
    op.drop_index("ix_task_schedules_status", table_name="task_schedules")
    op.drop_index("ix_task_schedules_task_id", table_name="task_schedules")
    op.drop_index("ix_task_schedules_board", table_name="task_schedules")
    op.drop_index("ix_task_schedules_agent_range", table_name="task_schedules")
    op.drop_table("task_schedules")

    op.drop_index("ix_calendar_events_event_type", table_name="calendar_events")
    op.drop_index("ix_calendar_events_board_id", table_name="calendar_events")
    op.drop_index("ix_calendar_events_org_range", table_name="calendar_events")
    op.drop_table("calendar_events")
