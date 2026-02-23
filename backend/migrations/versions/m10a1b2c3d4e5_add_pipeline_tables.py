"""add pipeline tables: pipelines, pipeline_runs, pipeline_stage_tasks

Revision ID: m10a1b2c3d4e5
Revises: m8a1b2c3d4e5
Create Date: 2026-02-23 10:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "m10a1b2c3d4e5"
down_revision = "m8a1b2c3d4e5"
branch_labels = None
depends_on = None


def _create_index_if_missing(
    existing: set,
    name: str,
    table: str,
    columns: list[str],
    unique: bool = False,
) -> None:
    if name not in existing:
        op.create_index(name, table, columns, unique=unique)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # -- pipelines --
    if not inspector.has_table("pipelines"):
        op.create_table(
            "pipelines",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("board_id", sa.Uuid(), nullable=True),
            sa.Column("name", sa.String(length=256), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column(
                "pipeline_type", sa.String(length=64), nullable=False, server_default="general"
            ),
            sa.Column("stages", JSONB(), nullable=False, server_default="[]"),
            sa.Column("trigger_config", JSONB(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    pl_indexes = {item.get("name") for item in inspector.get_indexes("pipelines")}
    _create_index_if_missing(pl_indexes, "ix_pipelines_org", "pipelines", ["organization_id"])
    _create_index_if_missing(pl_indexes, "ix_pipelines_board_id", "pipelines", ["board_id"])
    _create_index_if_missing(
        pl_indexes, "ix_pipelines_is_active", "pipelines", ["is_active"]
    )

    # -- pipeline_runs --
    if not inspector.has_table("pipeline_runs"):
        op.create_table(
            "pipeline_runs",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("pipeline_id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("input_data", JSONB(), nullable=True),
            sa.Column("current_stage_id", sa.String(length=128), nullable=True),
            sa.Column(
                "status", sa.String(length=32), nullable=False, server_default="running"
            ),
            sa.Column("stage_results", JSONB(), nullable=False, server_default="{}"),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["pipeline_id"], ["pipelines.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    pr_indexes = {item.get("name") for item in inspector.get_indexes("pipeline_runs")}
    _create_index_if_missing(
        pr_indexes,
        "ix_pipeline_runs_pipeline_status",
        "pipeline_runs",
        ["pipeline_id", "status"],
    )
    _create_index_if_missing(
        pr_indexes, "ix_pipeline_runs_org", "pipeline_runs", ["organization_id"]
    )
    _create_index_if_missing(
        pr_indexes, "ix_pipeline_runs_status", "pipeline_runs", ["status"]
    )

    # -- pipeline_stage_tasks --
    if not inspector.has_table("pipeline_stage_tasks"):
        op.create_table(
            "pipeline_stage_tasks",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("pipeline_run_id", sa.Uuid(), nullable=False),
            sa.Column("stage_id", sa.String(length=128), nullable=False),
            sa.Column("task_id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["pipeline_run_id"], ["pipeline_runs.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("pipeline_run_id", "stage_id", name="uq_pipeline_stage_task"),
        )

    pst_indexes = {item.get("name") for item in inspector.get_indexes("pipeline_stage_tasks")}
    _create_index_if_missing(
        pst_indexes,
        "ix_pipeline_stage_tasks_run",
        "pipeline_stage_tasks",
        ["pipeline_run_id"],
    )
    _create_index_if_missing(
        pst_indexes,
        "ix_pipeline_stage_tasks_task",
        "pipeline_stage_tasks",
        ["task_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_pipeline_stage_tasks_task", table_name="pipeline_stage_tasks")
    op.drop_index("ix_pipeline_stage_tasks_run", table_name="pipeline_stage_tasks")
    op.drop_table("pipeline_stage_tasks")

    op.drop_index("ix_pipeline_runs_status", table_name="pipeline_runs")
    op.drop_index("ix_pipeline_runs_org", table_name="pipeline_runs")
    op.drop_index("ix_pipeline_runs_pipeline_status", table_name="pipeline_runs")
    op.drop_table("pipeline_runs")

    op.drop_index("ix_pipelines_is_active", table_name="pipelines")
    op.drop_index("ix_pipelines_board_id", table_name="pipelines")
    op.drop_index("ix_pipelines_org", table_name="pipelines")
    op.drop_table("pipelines")
