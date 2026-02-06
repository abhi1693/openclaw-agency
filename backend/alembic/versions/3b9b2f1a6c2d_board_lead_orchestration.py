"""board lead orchestration

Revision ID: 3b9b2f1a6c2d
Revises: 9f2c1a7b0d3e
Create Date: 2026-02-05 14:45:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "3b9b2f1a6c2d"
down_revision = "9f2c1a7b0d3e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("boards", sa.Column("board_type", sa.String(), server_default="goal", nullable=False))
    op.add_column("boards", sa.Column("objective", sa.Text(), nullable=True))
    op.add_column("boards", sa.Column("success_metrics", sa.JSON(), nullable=True))
    op.add_column("boards", sa.Column("target_date", sa.DateTime(), nullable=True))
    op.add_column(
        "boards",
        sa.Column("goal_confirmed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("boards", sa.Column("goal_source", sa.Text(), nullable=True))

    op.add_column(
        "agents",
        sa.Column("is_board_lead", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )

    op.add_column(
        "tasks",
        sa.Column("auto_created", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("tasks", sa.Column("auto_reason", sa.Text(), nullable=True))

    op.create_table(
        "board_memory",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("board_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_board_memory_board_id", "board_memory", ["board_id"], unique=False)

    op.create_table(
        "approvals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("board_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.Uuid(), nullable=True),
        sa.Column("action_type", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("rubric_scores", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"]),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_approvals_board_id", "approvals", ["board_id"], unique=False)
    op.create_index("ix_approvals_agent_id", "approvals", ["agent_id"], unique=False)
    op.create_index("ix_approvals_status", "approvals", ["status"], unique=False)

    op.create_table(
        "board_onboarding_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("board_id", sa.Uuid(), nullable=False),
        sa.Column("session_key", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("messages", sa.JSON(), nullable=True),
        sa.Column("draft_goal", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_board_onboarding_sessions_board_id",
        "board_onboarding_sessions",
        ["board_id"],
        unique=False,
    )
    op.create_index(
        "ix_board_onboarding_sessions_status",
        "board_onboarding_sessions",
        ["status"],
        unique=False,
    )

    op.create_table(
        "task_fingerprints",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("board_id", sa.Uuid(), nullable=False),
        sa.Column("fingerprint_hash", sa.String(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_task_fingerprints_board_hash",
        "task_fingerprints",
        ["board_id", "fingerprint_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_task_fingerprints_board_hash", table_name="task_fingerprints")
    op.drop_table("task_fingerprints")
    op.drop_index(
        "ix_board_onboarding_sessions_status", table_name="board_onboarding_sessions"
    )
    op.drop_index(
        "ix_board_onboarding_sessions_board_id", table_name="board_onboarding_sessions"
    )
    op.drop_table("board_onboarding_sessions")
    op.drop_index("ix_approvals_status", table_name="approvals")
    op.drop_index("ix_approvals_agent_id", table_name="approvals")
    op.drop_index("ix_approvals_board_id", table_name="approvals")
    op.drop_table("approvals")
    op.drop_index("ix_board_memory_board_id", table_name="board_memory")
    op.drop_table("board_memory")
    op.drop_column("tasks", "auto_reason")
    op.drop_column("tasks", "auto_created")
    op.drop_column("agents", "is_board_lead")
    op.drop_column("boards", "goal_source")
    op.drop_column("boards", "goal_confirmed")
    op.drop_column("boards", "target_date")
    op.drop_column("boards", "success_metrics")
    op.drop_column("boards", "objective")
    op.drop_column("boards", "board_type")
