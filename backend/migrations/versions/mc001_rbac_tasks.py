"""Phase 1 — DB models + migration for RBAC + enhanced tasks.

Adds new columns to mc_tasks for the enhanced task model,
creates mc_users, task_activity_logs, and task_comments tables,
and seeds the owner user arpit@plentum.com.

Revision ID: mc001_rbac_tasks
Revises: b7a1d9c3e4f5
Create Date: 2026-02-23 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "mc001_rbac_tasks"
down_revision = "b7a1d9c3e4f5"
branch_labels = None
depends_on = None

# bcrypt hash of "MissionControl2026!" with 12 rounds
_OWNER_PASSWORD_HASH = (
    "$2b$12$Ryx9A7T0OnnWjPX5fm2ukOF8aoFsbooZsZeHYrQ7fyhBnllczt/Mu"
)


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. ALTER mc_tasks — add new columns (all nullable for backward compat)
    # ------------------------------------------------------------------
    op.add_column("mc_tasks", sa.Column("task_uid", sa.String(), nullable=True))
    op.add_column("mc_tasks", sa.Column("category", sa.String(), nullable=True))
    op.add_column("mc_tasks", sa.Column("sub_category", sa.String(), nullable=True))
    op.add_column("mc_tasks", sa.Column("priority", sa.String(), nullable=True))
    op.add_column("mc_tasks", sa.Column("urgency_flag", sa.Boolean(), nullable=True))
    op.add_column("mc_tasks", sa.Column("blocked_reason", sa.String(), nullable=True))
    op.add_column(
        "mc_tasks", sa.Column("collaborator_agents", sa.JSON(), nullable=True)
    )
    op.add_column("mc_tasks", sa.Column("created_by", sa.String(), nullable=True))
    op.add_column("mc_tasks", sa.Column("assigned_by", sa.String(), nullable=True))
    op.add_column("mc_tasks", sa.Column("brand_name", sa.String(), nullable=True))
    op.add_column("mc_tasks", sa.Column("checklist", sa.JSON(), nullable=True))
    op.add_column(
        "mc_tasks", sa.Column("checklist_progress", sa.Float(), nullable=True)
    )
    op.add_column("mc_tasks", sa.Column("skills_required", sa.JSON(), nullable=True))
    op.add_column("mc_tasks", sa.Column("reference_docs", sa.JSON(), nullable=True))
    op.add_column("mc_tasks", sa.Column("notes", sa.String(), nullable=True))
    op.add_column("mc_tasks", sa.Column("due_date", sa.DateTime(), nullable=True))
    op.add_column("mc_tasks", sa.Column("started_at", sa.DateTime(), nullable=True))
    op.add_column("mc_tasks", sa.Column("completed_at", sa.DateTime(), nullable=True))
    op.add_column(
        "mc_tasks", sa.Column("estimated_hours", sa.Float(), nullable=True)
    )
    op.add_column("mc_tasks", sa.Column("parent_task_id", sa.Uuid(), nullable=True))
    op.add_column("mc_tasks", sa.Column("depends_on", sa.JSON(), nullable=True))
    op.add_column("mc_tasks", sa.Column("source", sa.String(), nullable=True))

    op.create_index("ix_mc_tasks_task_uid", "mc_tasks", ["task_uid"], unique=True)
    op.create_index("ix_mc_tasks_category", "mc_tasks", ["category"], unique=False)
    op.create_index("ix_mc_tasks_priority", "mc_tasks", ["priority"], unique=False)

    # Backfill defaults for existing rows
    op.execute("UPDATE mc_tasks SET category = 'general' WHERE category IS NULL")
    op.execute("UPDATE mc_tasks SET priority = 'medium' WHERE priority IS NULL")
    op.execute("UPDATE mc_tasks SET source = 'manual' WHERE source IS NULL")
    op.execute("UPDATE mc_tasks SET urgency_flag = false WHERE urgency_flag IS NULL")
    op.execute(
        "UPDATE mc_tasks SET checklist_progress = 0.0 WHERE checklist_progress IS NULL"
    )

    # ------------------------------------------------------------------
    # 2. CREATE mc_users table
    # ------------------------------------------------------------------
    op.create_table(
        "mc_users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("avatar_url", sa.String(), nullable=True),
        sa.Column("role", sa.String(), nullable=False, server_default="viewer"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_login", sa.DateTime(), nullable=True),
        sa.Column("custom_permissions", sa.JSON(), nullable=True),
        sa.Column("brand_access", sa.JSON(), nullable=True),
        sa.Column("department_access", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_mc_users_email", "mc_users", ["email"], unique=True)
    op.create_index("ix_mc_users_role", "mc_users", ["role"], unique=False)

    # ------------------------------------------------------------------
    # 3. CREATE task_activity_logs table
    # ------------------------------------------------------------------
    op.create_table(
        "task_activity_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("task_uid", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("actor", sa.String(), nullable=False),
        sa.Column(
            "actor_type", sa.String(), nullable=False, server_default="human"
        ),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column(
            "timestamp",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["task_id"], ["mc_tasks.id"], name="fk_task_activity_logs_task_id"
        ),
    )
    op.create_index(
        "ix_task_activity_logs_task_id",
        "task_activity_logs",
        ["task_id"],
        unique=False,
    )
    op.create_index(
        "ix_task_activity_logs_task_uid",
        "task_activity_logs",
        ["task_uid"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # 4. CREATE task_comments table
    # ------------------------------------------------------------------
    op.create_table(
        "task_comments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("task_uid", sa.String(), nullable=False),
        sa.Column("author", sa.String(), nullable=False),
        sa.Column("author_type", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("parent_comment_id", sa.Uuid(), nullable=True),
        sa.Column("mentions", sa.JSON(), nullable=True),
        sa.Column(
            "is_system_message",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["task_id"], ["mc_tasks.id"], name="fk_task_comments_task_id"
        ),
        sa.ForeignKeyConstraint(
            ["parent_comment_id"],
            ["task_comments.id"],
            name="fk_task_comments_parent",
        ),
    )
    op.create_index(
        "ix_task_comments_task_id", "task_comments", ["task_id"], unique=False
    )
    op.create_index(
        "ix_task_comments_task_uid", "task_comments", ["task_uid"], unique=False
    )

    # ------------------------------------------------------------------
    # 5. SEED owner user
    # ------------------------------------------------------------------
    op.execute(
        sa.text(
            "INSERT INTO mc_users (id, email, password_hash, name, role, is_active) "
            "VALUES (gen_random_uuid(), :email, :pw, :name, 'owner', true)"
        ).bindparams(
            email="arpit@plentum.com",
            pw=_OWNER_PASSWORD_HASH,
            name="Arpit",
        )
    )


def downgrade() -> None:
    # Drop seeded user
    op.execute("DELETE FROM mc_users WHERE email = 'arpit@plentum.com'")

    # Drop new tables
    op.drop_table("task_comments")
    op.drop_table("task_activity_logs")
    op.drop_table("mc_users")

    # Drop new indexes on mc_tasks
    op.drop_index("ix_mc_tasks_priority", table_name="mc_tasks")
    op.drop_index("ix_mc_tasks_category", table_name="mc_tasks")
    op.drop_index("ix_mc_tasks_task_uid", table_name="mc_tasks")

    # Drop new columns from mc_tasks
    for col in [
        "task_uid",
        "category",
        "sub_category",
        "priority",
        "urgency_flag",
        "blocked_reason",
        "collaborator_agents",
        "created_by",
        "assigned_by",
        "brand_name",
        "checklist",
        "checklist_progress",
        "skills_required",
        "reference_docs",
        "notes",
        "due_date",
        "started_at",
        "completed_at",
        "estimated_hours",
        "parent_task_id",
        "depends_on",
        "source",
    ]:
        op.drop_column("mc_tasks", col)
