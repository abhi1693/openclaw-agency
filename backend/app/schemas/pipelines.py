"""工作流管道 Pydantic schemas — 请求体与响应体定义。"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 管道阶段配置 schema（JSONB 内嵌结构）
# ---------------------------------------------------------------------------


class PipelineStageConfig(BaseModel):
    """单个管道阶段的配置结构。"""

    id: str = Field(description="阶段唯一标识符")
    name: str = Field(description="阶段显示名称")
    type: str = Field(description="阶段类型: ai_task | approval | manual | webhook | condition")
    config: dict[str, Any] = Field(default_factory=dict, description="阶段特定配置")
    next_stage_id: str | None = Field(default=None, description="正常流程下的下一阶段 ID")
    condition: dict[str, Any] | None = Field(default=None, description="条件阶段的判断表达式")


class TriggerConfig(BaseModel):
    """管道触发配置。"""

    trigger_type: str = Field(description="触发类型: manual | schedule | event")
    cron_expr: str | None = Field(default=None, description="定时触发的 cron 表达式")
    event_type: str | None = Field(default=None, description="事件触发类型")


# ---------------------------------------------------------------------------
# Pipeline CRUD schemas
# ---------------------------------------------------------------------------


class PipelineCreate(BaseModel):
    """创建管道请求体。"""

    name: str = Field(max_length=256, description="管道名称")
    description: str | None = Field(default=None, description="管道描述")
    pipeline_type: str = Field(default="general", max_length=64, description="管道类型")
    board_id: UUID | None = Field(default=None, description="关联看板 ID（可选）")
    stages: list[dict[str, Any]] = Field(default_factory=list, description="阶段配置列表")
    trigger_config: dict[str, Any] | None = Field(default=None, description="触发配置")
    is_active: bool = Field(default=True, description="是否激活")


class PipelineUpdate(BaseModel):
    """更新管道请求体（所有字段可选）。"""

    name: str | None = Field(default=None, max_length=256)
    description: str | None = None
    pipeline_type: str | None = Field(default=None, max_length=64)
    board_id: UUID | None = None
    stages: list[dict[str, Any]] | None = None
    trigger_config: dict[str, Any] | None = None
    is_active: bool | None = None


class PipelineRead(BaseModel):
    """管道详情响应体。"""

    model_config = {"from_attributes": True}

    id: UUID
    organization_id: UUID
    board_id: UUID | None
    name: str
    description: str | None
    pipeline_type: str
    stages: list[Any]
    trigger_config: dict[str, Any] | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# PipelineRun schemas
# ---------------------------------------------------------------------------


class PipelineRunStart(BaseModel):
    """启动管道运行请求体。"""

    input_data: dict[str, Any] | None = Field(default=None, description="管道输入数据")


class PipelineRunRead(BaseModel):
    """管道执行记录响应体。"""

    model_config = {"from_attributes": True}

    id: UUID
    pipeline_id: UUID
    organization_id: UUID
    input_data: dict[str, Any] | None
    current_stage_id: str | None
    status: str
    stage_results: dict[str, Any]
    started_at: datetime
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# 预定义管道模板
# ---------------------------------------------------------------------------


class PipelineTemplate(BaseModel):
    """预定义管道模板定义。"""

    id: str
    name: str
    description: str
    pipeline_type: str
    stages: list[dict[str, Any]]
    trigger_config: dict[str, Any] | None = None
