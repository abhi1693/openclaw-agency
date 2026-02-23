"""工作流管道模型 — 管道定义、执行记录、阶段任务关联。"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from app.core.time import utcnow
from app.models.tenancy import TenantScoped


class Pipeline(TenantScoped, table=True):
    """工作流管道定义，包含阶段配置和触发条件。"""

    __tablename__ = "pipelines"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    board_id: UUID | None = Field(default=None, foreign_key="boards.id", index=True)

    name: str = Field(max_length=256)
    description: str | None = None
    pipeline_type: str = Field(default="general", max_length=64)
    # 管道类型: general, review_flow, release_flow, onboarding

    stages: list[Any] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="[]"),
    )
    # stages 结构: [{ id, name, type, config, next_stage_id, condition? }]
    # stage type: ai_task, approval, manual, webhook, condition

    trigger_config: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    # { trigger_type: manual|schedule|event, cron_expr?, event_type? }

    is_active: bool = Field(default=True)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PipelineRun(TenantScoped, table=True):
    """管道执行记录，跟踪每次运行的阶段进度和结果。"""

    __tablename__ = "pipeline_runs"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    pipeline_id: UUID = Field(foreign_key="pipelines.id", index=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)

    input_data: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    current_stage_id: str | None = Field(default=None, max_length=128)

    status: str = Field(default="running", max_length=32, index=True)
    # status 值: running, paused, completed, failed, cancelled

    stage_results: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default="{}"),
    )
    # { stage_id: { status, output, started_at, completed_at } }

    started_at: datetime = Field(default_factory=utcnow)
    completed_at: datetime | None = None

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PipelineStageTask(TenantScoped, table=True):
    """管道阶段与任务的关联表 — 记录每个阶段创建的任务。"""

    __tablename__ = "pipeline_stage_tasks"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    pipeline_run_id: UUID = Field(foreign_key="pipeline_runs.id", index=True)
    stage_id: str = Field(max_length=128)
    task_id: UUID = Field(foreign_key="tasks.id", index=True)

    created_at: datetime = Field(default_factory=utcnow)
