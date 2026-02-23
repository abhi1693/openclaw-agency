"""工作流管道 API 集成测试。"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models.pipelines import Pipeline, PipelineRun, PipelineStageTask
from app.services.pipeline_engine import (
    PIPELINE_TEMPLATES,
    PipelineEngine,
)


# ---------------------------------------------------------------------------
# 测试工具和 fixtures
# ---------------------------------------------------------------------------


def make_pipeline(
    *,
    organization_id: Any = None,
    stages: list[dict] | None = None,
    pipeline_type: str = "general",
    is_active: bool = True,
) -> Pipeline:
    """创建测试用管道对象。"""
    if organization_id is None:
        organization_id = uuid4()
    if stages is None:
        stages = [
            {
                "id": "stage_1",
                "name": "测试阶段",
                "type": "manual",
                "config": {"message": "请确认"},
                "next_stage_id": None,
            }
        ]
    return Pipeline(
        id=uuid4(),
        organization_id=organization_id,
        name="测试管道",
        description="用于测试的管道",
        pipeline_type=pipeline_type,
        stages=stages,
        trigger_config={"trigger_type": "manual"},
        is_active=is_active,
    )


def make_pipeline_run(
    *,
    pipeline: Pipeline,
    status: str = "running",
    current_stage_id: str | None = None,
) -> PipelineRun:
    """创建测试用管道执行记录。"""
    return PipelineRun(
        id=uuid4(),
        pipeline_id=pipeline.id,
        organization_id=pipeline.organization_id,
        status=status,
        current_stage_id=current_stage_id or (pipeline.stages[0]["id"] if pipeline.stages else None),
        stage_results={},
    )


# ---------------------------------------------------------------------------
# PipelineEngine 单元测试
# ---------------------------------------------------------------------------


class TestPipelineEngine:
    """PipelineEngine 状态机测试。"""

    def _make_session(self) -> MagicMock:
        """创建模拟数据库会话。"""
        session = AsyncMock()
        session.add = MagicMock()
        session.flush = AsyncMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()
        return session

    @pytest.mark.asyncio
    async def test_start_run_no_stages_raises(self) -> None:
        """空阶段管道启动应抛出 ValueError。"""
        session = self._make_session()
        engine = PipelineEngine(session)
        pipeline = make_pipeline(stages=[])
        with pytest.raises(ValueError, match="没有配置任何阶段"):
            await engine.start_run(pipeline=pipeline)

    @pytest.mark.asyncio
    async def test_start_run_manual_stage(self) -> None:
        """手动阶段应将管道置于暂停状态。"""
        session = self._make_session()
        engine = PipelineEngine(session)
        pipeline = make_pipeline(
            stages=[
                {
                    "id": "stage_manual",
                    "name": "手动确认",
                    "type": "manual",
                    "config": {"message": "请确认"},
                    "next_stage_id": None,
                }
            ]
        )

        # 模拟 session.refresh 不改变 run
        async def mock_refresh(obj: Any) -> None:
            pass

        session.refresh = mock_refresh

        run = await engine.start_run(pipeline=pipeline)
        assert run.status == "paused"
        assert run.current_stage_id == "stage_manual"

    @pytest.mark.asyncio
    async def test_cancel_run(self) -> None:
        """取消执行应将状态设为 cancelled 并记录完成时间。"""
        session = self._make_session()
        engine = PipelineEngine(session)
        pipeline = make_pipeline()
        run = make_pipeline_run(pipeline=pipeline, status="paused")

        async def mock_refresh(obj: Any) -> None:
            pass

        session.refresh = mock_refresh

        result = await engine.cancel_run(run=run)
        assert result.status == "cancelled"
        assert result.completed_at is not None

    @pytest.mark.asyncio
    async def test_advance_run_invalid_status(self) -> None:
        """非 running/paused 状态的执行记录不能推进。"""
        session = self._make_session()
        engine = PipelineEngine(session)
        pipeline = make_pipeline()
        run = make_pipeline_run(pipeline=pipeline, status="completed")
        with pytest.raises(ValueError, match="无法推进"):
            await engine.advance_run(run=run, pipeline=pipeline)

    def test_find_stage_found(self) -> None:
        """_find_stage 应找到对应 ID 的阶段。"""
        stages = [
            {"id": "s1", "name": "阶段1", "type": "manual"},
            {"id": "s2", "name": "阶段2", "type": "webhook"},
        ]
        result = PipelineEngine._find_stage(stages, "s2")
        assert result is not None
        assert result["id"] == "s2"

    def test_find_stage_not_found(self) -> None:
        """_find_stage 未找到时应返回 None。"""
        stages = [{"id": "s1", "name": "阶段1", "type": "manual"}]
        result = PipelineEngine._find_stage(stages, "s999")
        assert result is None

    def test_find_stage_none_id(self) -> None:
        """_find_stage 传入 None 应返回 None。"""
        stages = [{"id": "s1"}]
        result = PipelineEngine._find_stage(stages, None)
        assert result is None

    def test_evaluate_condition_true(self) -> None:
        """表达式 'true' 应返回 True。"""
        engine = PipelineEngine(AsyncMock())
        assert engine._evaluate_condition("true", {}) is True

    def test_evaluate_condition_false(self) -> None:
        """表达式 'false' 应返回 False。"""
        engine = PipelineEngine(AsyncMock())
        assert engine._evaluate_condition("false", {}) is False

    def test_evaluate_condition_equality(self) -> None:
        """等值条件 'stage_results.s1.status == completed' 应正确求值。"""
        engine = PipelineEngine(AsyncMock())
        context = {"stage_results": {"s1": {"status": "completed"}}}
        assert engine._evaluate_condition("stage_results.s1.status == completed", context) is True

    def test_evaluate_condition_equality_false(self) -> None:
        """等值条件不匹配时应返回 False。"""
        engine = PipelineEngine(AsyncMock())
        context = {"stage_results": {"s1": {"status": "running"}}}
        assert engine._evaluate_condition("stage_results.s1.status == completed", context) is False

    def test_resolve_path(self) -> None:
        """_resolve_path 应正确解析点分路径。"""
        engine = PipelineEngine(AsyncMock())
        data = {"a": {"b": {"c": "value"}}}
        assert engine._resolve_path("a.b.c", data) == "value"

    def test_resolve_path_missing(self) -> None:
        """_resolve_path 路径不存在时应返回 None。"""
        engine = PipelineEngine(AsyncMock())
        data = {"a": {}}
        assert engine._resolve_path("a.b.c", data) is None


# ---------------------------------------------------------------------------
# 预定义模板测试
# ---------------------------------------------------------------------------


class TestPipelineTemplates:
    """管道模板配置测试。"""

    def test_templates_not_empty(self) -> None:
        """模板列表不应为空。"""
        assert len(PIPELINE_TEMPLATES) > 0

    def test_templates_have_required_fields(self) -> None:
        """每个模板必须包含 id, name, stages 字段。"""
        required_fields = {"id", "name", "stages", "pipeline_type", "description"}
        for template in PIPELINE_TEMPLATES:
            missing = required_fields - set(template.keys())
            assert not missing, f"模板 {template.get('id')} 缺少字段: {missing}"

    def test_templates_stages_have_required_fields(self) -> None:
        """每个模板的阶段必须包含 id, name, type 字段。"""
        stage_required = {"id", "name", "type"}
        for template in PIPELINE_TEMPLATES:
            for stage in template["stages"]:
                missing = stage_required - set(stage.keys())
                assert not missing, (
                    f"模板 {template['id']} 的阶段 {stage.get('id')} 缺少字段: {missing}"
                )

    def test_templates_valid_stage_types(self) -> None:
        """所有阶段类型必须是允许的类型之一。"""
        valid_types = {"ai_task", "approval", "manual", "webhook", "condition"}
        for template in PIPELINE_TEMPLATES:
            for stage in template["stages"]:
                assert stage["type"] in valid_types, (
                    f"模板 {template['id']} 阶段 {stage['id']} 的类型 {stage['type']} 不合法"
                )

    def test_review_flow_template_exists(self) -> None:
        """评审流程模板应存在。"""
        ids = {t["id"] for t in PIPELINE_TEMPLATES}
        assert "review_flow" in ids

    def test_onboarding_template_exists(self) -> None:
        """入职流程模板应存在。"""
        ids = {t["id"] for t in PIPELINE_TEMPLATES}
        assert "onboarding" in ids


# ---------------------------------------------------------------------------
# Pipeline 模型测试
# ---------------------------------------------------------------------------


class TestPipelineModel:
    """Pipeline 模型字段验证测试。"""

    def test_pipeline_default_type(self) -> None:
        """管道默认类型应为 general。"""
        pipeline = Pipeline(
            organization_id=uuid4(),
            name="测试管道",
        )
        assert pipeline.pipeline_type == "general"

    def test_pipeline_default_active(self) -> None:
        """管道默认激活状态应为 True。"""
        pipeline = Pipeline(
            organization_id=uuid4(),
            name="测试管道",
        )
        assert pipeline.is_active is True

    def test_pipeline_run_default_status(self) -> None:
        """执行记录默认状态应为 running。"""
        run = PipelineRun(
            pipeline_id=uuid4(),
            organization_id=uuid4(),
        )
        assert run.status == "running"

    def test_pipeline_run_empty_stage_results(self) -> None:
        """执行记录的 stage_results 默认应为空字典。"""
        run = PipelineRun(
            pipeline_id=uuid4(),
            organization_id=uuid4(),
        )
        assert run.stage_results == {}
