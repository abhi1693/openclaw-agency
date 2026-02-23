"""工作流管道 API 路由 — CRUD 操作与执行管理。"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import col, select

from app.api.deps import require_admin_auth
from app.core.time import utcnow
from app.db.pagination import paginate
from app.db.session import get_session
from app.models.pipelines import Pipeline, PipelineRun, PipelineStageTask
from app.schemas.common import OkResponse
from app.schemas.pagination import DefaultLimitOffsetPage
from app.schemas.pipelines import (
    PipelineCreate,
    PipelineRead,
    PipelineRunRead,
    PipelineRunStart,
    PipelineTemplate,
    PipelineUpdate,
)
from app.services.pipeline_engine import (
    PIPELINE_TEMPLATES,
    PipelineEngine,
    get_pipeline_or_404,
    get_pipeline_run_or_404,
)

if TYPE_CHECKING:
    from fastapi_pagination.limit_offset import LimitOffsetPage
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.core.auth import AuthContext

router = APIRouter(prefix="/pipelines", tags=["pipelines"])
runs_router = APIRouter(prefix="/pipeline-runs", tags=["pipelines"])
templates_router = APIRouter(prefix="/pipeline-templates", tags=["pipelines"])

ADMIN_AUTH_DEP = Depends(require_admin_auth)
SESSION_DEP = Depends(get_session)


# ---------------------------------------------------------------------------
# 管道 CRUD
# ---------------------------------------------------------------------------


@router.get("", response_model=DefaultLimitOffsetPage[PipelineRead])
async def list_pipelines(
    board_id: UUID | None = None,
    is_active: bool | None = None,
    auth: AuthContext = ADMIN_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> LimitOffsetPage[PipelineRead]:
    """列出组织内的工作流管道（支持分页和筛选）。"""
    organization_id = _require_organization_id(auth)
    statement = select(Pipeline).where(col(Pipeline.organization_id) == organization_id)
    if board_id is not None:
        statement = statement.where(col(Pipeline.board_id) == board_id)
    if is_active is not None:
        statement = statement.where(col(Pipeline.is_active) == is_active)
    statement = statement.order_by(col(Pipeline.created_at).desc())
    return await paginate(session, statement)


@router.post("", response_model=PipelineRead, status_code=status.HTTP_201_CREATED)
async def create_pipeline(
    payload: PipelineCreate,
    auth: AuthContext = ADMIN_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> Pipeline:
    """创建新的工作流管道定义。"""
    organization_id = _require_organization_id(auth)
    pipeline = Pipeline(
        organization_id=organization_id,
        board_id=payload.board_id,
        name=payload.name,
        description=payload.description,
        pipeline_type=payload.pipeline_type,
        stages=payload.stages,
        trigger_config=payload.trigger_config,
        is_active=payload.is_active,
    )
    session.add(pipeline)
    await session.commit()
    await session.refresh(pipeline)
    return pipeline


@router.get("/{pipeline_id}", response_model=PipelineRead)
async def get_pipeline(
    pipeline_id: UUID,
    auth: AuthContext = ADMIN_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> Pipeline:
    """获取管道详情。"""
    organization_id = _require_organization_id(auth)
    return await get_pipeline_or_404(
        session, pipeline_id=pipeline_id, organization_id=organization_id
    )


@router.patch("/{pipeline_id}", response_model=PipelineRead)
async def update_pipeline(
    pipeline_id: UUID,
    payload: PipelineUpdate,
    auth: AuthContext = ADMIN_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> Pipeline:
    """更新管道定义（支持部分更新）。"""
    organization_id = _require_organization_id(auth)
    pipeline = await get_pipeline_or_404(
        session, pipeline_id=pipeline_id, organization_id=organization_id
    )
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(pipeline, key, value)
    pipeline.updated_at = utcnow()
    session.add(pipeline)
    await session.commit()
    await session.refresh(pipeline)
    return pipeline


@router.delete("/{pipeline_id}", response_model=OkResponse)
async def delete_pipeline(
    pipeline_id: UUID,
    auth: AuthContext = ADMIN_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> OkResponse:
    """删除管道及其所有执行记录。"""
    organization_id = _require_organization_id(auth)
    pipeline = await get_pipeline_or_404(
        session, pipeline_id=pipeline_id, organization_id=organization_id
    )
    await session.delete(pipeline)
    await session.commit()
    return OkResponse()


# ---------------------------------------------------------------------------
# 管道执行
# ---------------------------------------------------------------------------


@router.post("/{pipeline_id}/run", response_model=PipelineRunRead, status_code=status.HTTP_201_CREATED)
async def start_pipeline_run(
    pipeline_id: UUID,
    payload: PipelineRunStart,
    auth: AuthContext = ADMIN_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> PipelineRun:
    """启动管道执行，进入第一个阶段。"""
    organization_id = _require_organization_id(auth)
    pipeline = await get_pipeline_or_404(
        session, pipeline_id=pipeline_id, organization_id=organization_id
    )
    if not pipeline.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="管道已停用，无法启动执行。",
        )
    engine = PipelineEngine(session)
    return await engine.start_run(pipeline=pipeline, input_data=payload.input_data)


@router.get("/{pipeline_id}/runs", response_model=DefaultLimitOffsetPage[PipelineRunRead])
async def list_pipeline_runs(
    pipeline_id: UUID,
    run_status: str | None = None,
    auth: AuthContext = ADMIN_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> LimitOffsetPage[PipelineRunRead]:
    """列出管道的所有执行记录。"""
    organization_id = _require_organization_id(auth)
    await get_pipeline_or_404(
        session, pipeline_id=pipeline_id, organization_id=organization_id
    )
    statement = (
        select(PipelineRun)
        .where(col(PipelineRun.pipeline_id) == pipeline_id)
        .where(col(PipelineRun.organization_id) == organization_id)
    )
    if run_status:
        statement = statement.where(col(PipelineRun.status) == run_status)
    statement = statement.order_by(col(PipelineRun.created_at).desc())
    return await paginate(session, statement)


# ---------------------------------------------------------------------------
# 管道执行记录操作
# ---------------------------------------------------------------------------


@runs_router.get("/{run_id}", response_model=PipelineRunRead)
async def get_pipeline_run(
    run_id: UUID,
    auth: AuthContext = ADMIN_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> PipelineRun:
    """获取管道执行记录详情（含阶段结果）。"""
    organization_id = _require_organization_id(auth)
    return await get_pipeline_run_or_404(
        session, run_id=run_id, organization_id=organization_id
    )


@runs_router.post("/{run_id}/advance", response_model=PipelineRunRead)
async def advance_pipeline_run(
    run_id: UUID,
    stage_output: dict | None = None,
    auth: AuthContext = ADMIN_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> PipelineRun:
    """推进暂停中的管道执行到下一个阶段（用于 manual/approval 阶段确认）。"""
    organization_id = _require_organization_id(auth)
    run = await get_pipeline_run_or_404(
        session, run_id=run_id, organization_id=organization_id
    )
    if run.status != "paused":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"管道运行状态为 {run.status}，只有暂停状态可以推进。",
        )
    pipeline = (
        await session.exec(select(Pipeline).where(col(Pipeline.id) == run.pipeline_id))
    ).first()
    if pipeline is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="管道不存在。")

    engine = PipelineEngine(session)
    return await engine.advance_run(run=run, pipeline=pipeline, stage_output=stage_output)


@runs_router.post("/{run_id}/cancel", response_model=PipelineRunRead)
async def cancel_pipeline_run(
    run_id: UUID,
    auth: AuthContext = ADMIN_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> PipelineRun:
    """取消管道执行。"""
    organization_id = _require_organization_id(auth)
    run = await get_pipeline_run_or_404(
        session, run_id=run_id, organization_id=organization_id
    )
    if run.status in {"completed", "cancelled", "failed"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"管道运行已处于终态 {run.status}，无法取消。",
        )
    engine = PipelineEngine(session)
    return await engine.cancel_run(run=run)


# ---------------------------------------------------------------------------
# 管道模板
# ---------------------------------------------------------------------------


@templates_router.get("", response_model=list[PipelineTemplate])
async def list_pipeline_templates(
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> list[dict]:
    """列出预定义的管道模板。"""
    return PIPELINE_TEMPLATES


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------


def _require_organization_id(auth: AuthContext) -> UUID:
    """从认证上下文中提取组织 ID，未认证则抛出 401。"""
    if auth.user is None or auth.user.active_organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="需要有效的组织认证信息。",
        )
    return auth.user.active_organization_id
