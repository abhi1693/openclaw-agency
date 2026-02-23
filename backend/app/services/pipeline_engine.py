"""工作流管道引擎 — 异步状态机，负责阶段执行和状态转换。

支持的阶段类型:
- ai_task: 创建任务并分配给指定 Agent，等待完成
- approval: 创建审批请求，等待决议
- manual: 暂停执行，等待人工确认
- webhook: HTTP POST 到外部 URL
- condition: 评估 JSONB 条件表达式，分支到下一阶段
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

import httpx
from sqlmodel import col, select

from app.core.time import utcnow
from app.models.pipelines import Pipeline, PipelineRun, PipelineStageTask
from app.models.tasks import Task

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

# 预定义管道模板列表
PIPELINE_TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "review_flow",
        "name": "代码评审流程",
        "description": "标准化代码评审工作流：AI 分析 → 人工审批 → 完成确认",
        "pipeline_type": "review_flow",
        "stages": [
            {
                "id": "stage_ai_review",
                "name": "AI 代码分析",
                "type": "ai_task",
                "config": {"task_title": "代码评审分析", "description": "请对提交的代码进行分析和评审"},
                "next_stage_id": "stage_approval",
            },
            {
                "id": "stage_approval",
                "name": "人工审批",
                "type": "approval",
                "config": {"title": "代码评审审批", "description": "请审批 AI 分析结果"},
                "next_stage_id": "stage_confirm",
            },
            {
                "id": "stage_confirm",
                "name": "完成确认",
                "type": "manual",
                "config": {"message": "请确认代码评审已完成"},
                "next_stage_id": None,
            },
        ],
        "trigger_config": {"trigger_type": "manual"},
    },
    {
        "id": "onboarding",
        "name": "新员工入职流程",
        "description": "自动化新员工入职：环境配置 → 权限申请 → 培训任务",
        "pipeline_type": "onboarding",
        "stages": [
            {
                "id": "stage_setup",
                "name": "环境配置",
                "type": "ai_task",
                "config": {"task_title": "配置开发环境", "description": "为新员工配置开发环境和工具"},
                "next_stage_id": "stage_permissions",
            },
            {
                "id": "stage_permissions",
                "name": "权限申请",
                "type": "approval",
                "config": {"title": "系统权限申请", "description": "审批新员工系统访问权限"},
                "next_stage_id": "stage_training",
            },
            {
                "id": "stage_training",
                "name": "培训任务",
                "type": "ai_task",
                "config": {"task_title": "完成入职培训", "description": "完成公司必修培训课程"},
                "next_stage_id": None,
            },
        ],
        "trigger_config": {"trigger_type": "manual"},
    },
    {
        "id": "release_flow",
        "name": "发布流程",
        "description": "标准化软件发布：测试验证 → 审批 → Webhook 通知 → 完成",
        "pipeline_type": "release_flow",
        "stages": [
            {
                "id": "stage_test",
                "name": "测试验证",
                "type": "ai_task",
                "config": {"task_title": "执行发布前测试", "description": "验证发布版本的功能和性能"},
                "next_stage_id": "stage_approve",
            },
            {
                "id": "stage_approve",
                "name": "发布审批",
                "type": "approval",
                "config": {"title": "发布审批", "description": "批准本次软件发布"},
                "next_stage_id": "stage_notify",
            },
            {
                "id": "stage_notify",
                "name": "通知外部系统",
                "type": "webhook",
                "config": {"url": "", "method": "POST", "headers": {}},
                "next_stage_id": None,
            },
        ],
        "trigger_config": {"trigger_type": "manual"},
    },
]


class PipelineEngine:
    """工作流管道引擎 — 驱动管道从一个阶段到下一个阶段的状态机。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def start_run(
        self,
        *,
        pipeline: Pipeline,
        input_data: dict[str, Any] | None = None,
    ) -> PipelineRun:
        """启动新的管道执行，进入第一个阶段。"""
        stages: list[dict[str, Any]] = pipeline.stages or []
        if not stages:
            raise ValueError("管道没有配置任何阶段，无法启动执行。")

        first_stage = stages[0]
        run = PipelineRun(
            pipeline_id=pipeline.id,
            organization_id=pipeline.organization_id,
            input_data=input_data,
            current_stage_id=first_stage["id"],
            status="running",
            stage_results={},
        )
        self._session.add(run)
        await self._session.flush()

        # 执行第一个阶段
        await self._execute_stage(run=run, pipeline=pipeline, stage=first_stage)
        await self._session.commit()
        await self._session.refresh(run)
        return run

    async def advance_run(
        self,
        *,
        run: PipelineRun,
        pipeline: Pipeline,
        stage_output: dict[str, Any] | None = None,
    ) -> PipelineRun:
        """推进管道执行到下一个阶段。"""
        if run.status not in {"running", "paused"}:
            raise ValueError(f"管道运行状态为 {run.status}，无法推进。")

        current_stage = self._find_stage(pipeline.stages or [], run.current_stage_id)
        if current_stage is None:
            raise ValueError(f"找不到当前阶段: {run.current_stage_id}")

        # 记录当前阶段结果
        if stage_output:
            results = dict(run.stage_results or {})
            results[current_stage["id"]] = {
                "status": "completed",
                "output": stage_output,
                "completed_at": utcnow().isoformat(),
            }
            run.stage_results = results

        next_stage_id = current_stage.get("next_stage_id")
        if not next_stage_id:
            # 所有阶段完成
            run.status = "completed"
            run.current_stage_id = None
            run.completed_at = utcnow()
            run.updated_at = utcnow()
            self._session.add(run)
            await self._session.commit()
            await self._session.refresh(run)
            return run

        next_stage = self._find_stage(pipeline.stages or [], next_stage_id)
        if next_stage is None:
            raise ValueError(f"找不到下一阶段: {next_stage_id}")

        run.current_stage_id = next_stage_id
        run.status = "running"
        run.updated_at = utcnow()
        self._session.add(run)

        await self._execute_stage(run=run, pipeline=pipeline, stage=next_stage)
        await self._session.commit()
        await self._session.refresh(run)
        return run

    async def cancel_run(self, *, run: PipelineRun) -> PipelineRun:
        """取消管道执行。"""
        run.status = "cancelled"
        run.completed_at = utcnow()
        run.updated_at = utcnow()
        self._session.add(run)
        await self._session.commit()
        await self._session.refresh(run)
        return run

    async def _execute_stage(
        self,
        *,
        run: PipelineRun,
        pipeline: Pipeline,
        stage: dict[str, Any],
    ) -> None:
        """根据阶段类型执行对应的逻辑。"""
        stage_type = stage.get("type", "")
        stage_id = stage["id"]
        config = stage.get("config", {})

        # 初始化阶段结果
        results = dict(run.stage_results or {})
        results[stage_id] = {
            "status": "running",
            "started_at": utcnow().isoformat(),
        }
        run.stage_results = results

        try:
            if stage_type == "ai_task":
                await self._execute_ai_task_stage(
                    run=run, pipeline=pipeline, stage_id=stage_id, config=config
                )
            elif stage_type == "approval":
                await self._execute_approval_stage(run=run, stage_id=stage_id, config=config)
            elif stage_type == "manual":
                await self._execute_manual_stage(run=run, stage_id=stage_id, config=config)
            elif stage_type == "webhook":
                await self._execute_webhook_stage(run=run, stage_id=stage_id, config=config)
            elif stage_type == "condition":
                await self._execute_condition_stage(
                    run=run, pipeline=pipeline, stage=stage, config=config
                )
            else:
                logger.warning("未知阶段类型: %s，跳过执行。", stage_type)
        except Exception as exc:
            logger.error("阶段 %s 执行失败: %s", stage_id, exc)
            results = dict(run.stage_results or {})
            results[stage_id] = {
                "status": "failed",
                "error": str(exc),
                "completed_at": utcnow().isoformat(),
            }
            run.stage_results = results
            run.status = "failed"
            run.completed_at = utcnow()
            run.updated_at = utcnow()
            self._session.add(run)

    async def _execute_ai_task_stage(
        self,
        *,
        run: PipelineRun,
        pipeline: Pipeline,
        stage_id: str,
        config: dict[str, Any],
    ) -> None:
        """执行 AI 任务阶段：创建任务并分配给指定 Agent。"""
        task_title = config.get("task_title", "管道任务")
        description = config.get("description", "")
        agent_id = config.get("agent_id")
        board_id = config.get("board_id") or pipeline.board_id

        task = Task(
            title=task_title,
            description=description,
            status="inbox",
            priority="medium",
            board_id=board_id,
            assigned_agent_id=UUID(agent_id) if agent_id else None,
            auto_created=True,
            auto_reason=f"pipeline_run:{run.id}:stage:{stage_id}",
        )
        self._session.add(task)
        await self._session.flush()

        # 关联阶段与任务
        link = PipelineStageTask(
            pipeline_run_id=run.id,
            stage_id=stage_id,
            task_id=task.id,
        )
        self._session.add(link)

        # 更新阶段结果
        results = dict(run.stage_results or {})
        results[stage_id] = {
            "status": "waiting",
            "task_id": str(task.id),
            "started_at": utcnow().isoformat(),
        }
        run.stage_results = results
        run.status = "paused"  # 等待任务完成
        self._session.add(run)

    async def _execute_approval_stage(
        self,
        *,
        run: PipelineRun,
        stage_id: str,
        config: dict[str, Any],
    ) -> None:
        """执行审批阶段：暂停并等待审批决议。"""
        # 记录审批等待状态（实际审批由 approvals API 处理）
        results = dict(run.stage_results or {})
        results[stage_id] = {
            "status": "waiting_approval",
            "title": config.get("title", "审批"),
            "started_at": utcnow().isoformat(),
        }
        run.stage_results = results
        run.status = "paused"
        self._session.add(run)

    async def _execute_manual_stage(
        self,
        *,
        run: PipelineRun,
        stage_id: str,
        config: dict[str, Any],
    ) -> None:
        """执行人工确认阶段：暂停并等待操作者确认。"""
        results = dict(run.stage_results or {})
        results[stage_id] = {
            "status": "waiting_manual",
            "message": config.get("message", "请人工确认"),
            "started_at": utcnow().isoformat(),
        }
        run.stage_results = results
        run.status = "paused"
        self._session.add(run)

    async def _execute_webhook_stage(
        self,
        *,
        run: PipelineRun,
        stage_id: str,
        config: dict[str, Any],
    ) -> None:
        """执行 Webhook 阶段：HTTP POST 到外部 URL。"""
        url = config.get("url", "")
        headers = config.get("headers", {})
        payload = {
            "pipeline_run_id": str(run.id),
            "stage_id": stage_id,
            "stage_results": run.stage_results,
        }

        results = dict(run.stage_results or {})

        if not url:
            results[stage_id] = {
                "status": "skipped",
                "reason": "未配置 Webhook URL",
                "completed_at": utcnow().isoformat(),
            }
            run.stage_results = results
            self._session.add(run)
            return

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                results[stage_id] = {
                    "status": "completed",
                    "http_status": response.status_code,
                    "completed_at": utcnow().isoformat(),
                }
        except httpx.RequestError as exc:
            results[stage_id] = {
                "status": "failed",
                "error": f"Webhook 请求失败: {exc}",
                "completed_at": utcnow().isoformat(),
            }
            run.status = "failed"
            run.completed_at = utcnow()

        run.stage_results = results
        self._session.add(run)

    async def _execute_condition_stage(
        self,
        *,
        run: PipelineRun,
        pipeline: Pipeline,
        stage: dict[str, Any],
        config: dict[str, Any],
    ) -> None:
        """执行条件判断阶段：评估条件并分支到对应的下一阶段。"""
        condition = stage.get("condition", {})
        expression = condition.get("expression", "true")
        true_next = condition.get("true_next_stage_id", stage.get("next_stage_id"))
        false_next = condition.get("false_next_stage_id")

        # 简单条件评估（基于 stage_results 数据）
        context = {
            "stage_results": run.stage_results,
            "input_data": run.input_data or {},
        }
        condition_result = self._evaluate_condition(expression, context)

        next_stage_id = true_next if condition_result else false_next
        stage_id = stage["id"]

        results = dict(run.stage_results or {})
        results[stage_id] = {
            "status": "completed",
            "condition_result": condition_result,
            "next_stage_id": next_stage_id,
            "completed_at": utcnow().isoformat(),
        }
        run.stage_results = results

        # 更新下一阶段
        if next_stage_id:
            run.current_stage_id = next_stage_id
        self._session.add(run)

    def _evaluate_condition(self, expression: str, context: dict[str, Any]) -> bool:
        """安全评估条件表达式，返回布尔值。"""
        # 支持简单的内置条件
        if expression == "true":
            return True
        if expression == "false":
            return False

        # 支持 stage_results.{stage_id}.status == "completed" 格式
        try:
            parts = expression.split("==")
            if len(parts) == 2:
                left = parts[0].strip()
                right = parts[1].strip().strip('"').strip("'")
                # 解析路径访问
                value = self._resolve_path(left, context)
                return str(value) == right
        except Exception:
            pass

        return False

    def _resolve_path(self, path: str, context: dict[str, Any]) -> Any:
        """解析点分路径访问，如 stage_results.s1.status。"""
        parts = path.split(".")
        current: Any = context
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
        return current

    @staticmethod
    def _find_stage(
        stages: list[dict[str, Any]], stage_id: str | None
    ) -> dict[str, Any] | None:
        """在阶段列表中查找指定 ID 的阶段。"""
        if not stage_id:
            return None
        for stage in stages:
            if stage.get("id") == stage_id:
                return stage
        return None


async def get_pipeline_or_404(
    session: AsyncSession,
    *,
    pipeline_id: UUID,
    organization_id: UUID,
) -> Pipeline:
    """获取管道，如不存在则抛出 404。"""
    from fastapi import HTTPException, status as http_status

    pipeline = (
        await session.exec(
            select(Pipeline)
            .where(col(Pipeline.id) == pipeline_id)
            .where(col(Pipeline.organization_id) == organization_id)
        )
    ).first()
    if pipeline is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="管道不存在。")
    return pipeline


async def get_pipeline_run_or_404(
    session: AsyncSession,
    *,
    run_id: UUID,
    organization_id: UUID,
) -> PipelineRun:
    """获取管道执行记录，如不存在则抛出 404。"""
    from fastapi import HTTPException, status as http_status

    run = (
        await session.exec(
            select(PipelineRun)
            .where(col(PipelineRun.id) == run_id)
            .where(col(PipelineRun.organization_id) == organization_id)
        )
    ).first()
    if run is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND, detail="管道执行记录不存在。"
        )
    return run
