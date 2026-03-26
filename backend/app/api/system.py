"""System-level monitoring endpoints (hardware telemetry, cron jobs, etc.)."""

from __future__ import annotations

from typing import Any
import json
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import require_org_member
from app.db.session import get_session
from app.models.gateways import Gateway
from app.services.openclaw.gateway_resolver import gateway_client_config
from app.services.openclaw.gateway_rpc import OpenClawGatewayError, openclaw_call
from app.services.organizations import OrganizationContext

router = APIRouter(prefix="/system", tags=["system"])
public_router = APIRouter(tags=["system"])

SESSION_DEP = Depends(get_session)
ORG_MEMBER_DEP = Depends(require_org_member)


async def _first_gateway(session: AsyncSession, organization_id: Any) -> Gateway | None:
    result = await session.exec(
        select(Gateway)
        .where(col(Gateway.organization_id) == organization_id)
        .limit(1)
    )
    return result.first()


@router.get("/cron-jobs")
async def get_cron_jobs(
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
) -> JSONResponse:
    """Return the list of cron jobs from the organization's first gateway."""
    gateway = await _first_gateway(session, ctx.organization.id)
    if gateway is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Gateway 不可用", "jobs": []},
        )
    try:
        config = gateway_client_config(gateway)
        result = await openclaw_call("cron.list", {}, config=config)
        return JSONResponse(content={"jobs": result})
    except (OpenClawGatewayError, Exception):
        return JSONResponse(
            status_code=503,
            content={"error": "Gateway 不可用", "jobs": []},
        )


@router.get("/cron-jobs/{job_id}/runs")
async def get_cron_job_runs(
    job_id: str,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
) -> JSONResponse:
    """Return recent run history for a cron job."""
    gateway = await _first_gateway(session, ctx.organization.id)
    if gateway is None:
        return JSONResponse(status_code=503, content={"error": "Gateway 不可用", "runs": []})
    try:
        config = gateway_client_config(gateway)
        result = await openclaw_call("cron.runs", {"id": job_id}, config=config)
        runs = result if isinstance(result, list) else (result or [])
        return JSONResponse(content={"runs": runs})
    except (OpenClawGatewayError, Exception):
        return JSONResponse(status_code=503, content={"error": "Gateway 不可用", "runs": []})


class _CronJobUpdateBody:
    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled


@router.patch("/cron-jobs/{job_id}")
async def update_cron_job(
    job_id: str,
    body: dict,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
) -> JSONResponse:
    """Update a cron job (schedule, model, enabled)."""
    gateway = await _first_gateway(session, ctx.organization.id)
    if gateway is None:
        return JSONResponse(status_code=503, content={"error": "Gateway 不可用"})
    try:
        config = gateway_client_config(gateway)
        params: dict = {"id": job_id}
        if "enabled" in body:
            params["enabled"] = body["enabled"]
        if "schedule" in body:
            params["schedule"] = body["schedule"]
        if "model" in body:
            params["model"] = body["model"]
        await openclaw_call("cron.update", params, config=config)
        return JSONResponse(content={"ok": True})
    except (OpenClawGatewayError, Exception):
        return JSONResponse(status_code=503, content={"error": "Gateway 不可用"})


def _run(cmd: list[str]) -> str:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, check=False).stdout.strip()
    except Exception:
        return ""


@public_router.get("/api/system/hardware")
def get_public_hardware() -> JSONResponse:
    cpu = _run(["sysctl", "-n", "machdep.cpu.brand_string"]) or _run(["sysctl", "-n", "hw.model"])
    cores = _run(["sysctl", "-n", "hw.logicalcpu"])
    memsize = _run(["sysctl", "-n", "hw.memsize"])
    vm_stat = _run(["vm_stat"])
    df_out = _run(["df", "-k", "/"])
    uptime = _run(["uptime"])
    os_ver = _run(["sw_vers", "-productVersion"])
    model = _run(["sysctl", "-n", "hw.model"])
    ram_total = round(int(memsize or 0) / (1024 ** 3)) if str(memsize).isdigit() else 0
    page_size = 4096
    import re as _re
    free_match = _re.search(r"Pages free:\s+(\d+)", vm_stat or "")
    inactive_match = _re.search(r"Pages inactive:\s+(\d+)", vm_stat or "")
    pages_free = int(free_match.group(1)) if free_match else 0
    pages_inactive = int(inactive_match.group(1)) if inactive_match else 0
    ram_free_bytes = (pages_free + pages_inactive) * page_size
    ram_used = max(0, ram_total - round(ram_free_bytes / (1024 ** 3))) if ram_total else 0
    ram_pct = round((ram_used / ram_total) * 100) if ram_total else 0
    df_lines = df_out.splitlines(); df_data = df_lines[1].split() if len(df_lines) > 1 else []
    disk_total = round(int(df_data[1]) / (1024 ** 2)) if len(df_data) > 1 and df_data[1].isdigit() else 0
    disk_used = round(int(df_data[2]) / (1024 ** 2)) if len(df_data) > 2 and df_data[2].isdigit() else 0
    disk_free = round(int(df_data[3]) / (1024 ** 2)) if len(df_data) > 3 and df_data[3].isdigit() else 0
    disk_used_pct = round((disk_used / disk_total) * 100) if disk_total else 0
    return JSONResponse(content={"cpu": cpu or "Unknown", "cores": int(cores or 0), "ramTotal": ram_total, "ramUsed": ram_used, "ramPct": ram_pct, "diskTotal": disk_total, "diskUsed": disk_used, "diskFree": disk_free, "diskUsedPct": disk_used_pct, "uptime": uptime or "—", "osVersion": os_ver or "Unknown", "model": model or "Unknown"})


@public_router.get("/api/system/model-usage")
def get_public_model_usage() -> JSONResponse:
    agents_dir = Path.home() / ".openclaw" / "agents"
    agg: dict[str, dict[str, Any]] = {}
    for sessions_file in agents_dir.glob("*/sessions/sessions.json"):
        try:
            data = json.loads(sessions_file.read_text(encoding="utf-8"))
        except Exception:
            continue
        for session in data.values():
            model_id = session.get("model")
            provider = session.get("modelProvider")
            total_tokens = session.get("totalTokens") or 0
            if not model_id or not total_tokens:
                continue
            full_id = f"{provider}/{model_id}" if provider and "/" not in str(model_id) else model_id
            entry = agg.setdefault(full_id, {"id": full_id, "name": str(full_id).split("/")[-1], "provider": provider or "Unknown", "inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "cost": 0, "sessions": 0})
            entry["inputTokens"] += session.get("inputTokens") or 0
            entry["outputTokens"] += session.get("outputTokens") or 0
            entry["totalTokens"] += total_tokens
            entry["sessions"] += 1
    models = sorted(agg.values(), key=lambda item: item["totalTokens"], reverse=True)
    return JSONResponse(content={"models": models, "totalTokens": sum(item["totalTokens"] for item in models), "totalCost": 0})
