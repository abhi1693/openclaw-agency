"""Intel reports and queue API endpoints."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request, status

router = APIRouter(prefix="/api/intel", tags=["intel"])

WORKSPACE_DIR = Path.home() / ".openclaw" / "workspace"
INTEL_REPORTS_DIR = WORKSPACE_DIR / "reports" / "intel"
DAILY_DIR = INTEL_REPORTS_DIR / "daily"
WEEKLY_DIR = INTEL_REPORTS_DIR / "weekly"
QUEUE_FILE = WORKSPACE_DIR / "config" / "intel-queue.json"

ReportType = Literal["daily", "weekly"]


def _ensure_dirs() -> None:
    DAILY_DIR.mkdir(parents=True, exist_ok=True)
    WEEKLY_DIR.mkdir(parents=True, exist_ok=True)
    QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)


def _resolve_report_dir(report_type: ReportType) -> Path:
    return WEEKLY_DIR if report_type == "weekly" else DAILY_DIR


def _extract_date(filename: str, fallback: str) -> str:
    base = filename.removesuffix(".md")
    if len(base) == 10 and base[4] == "-" and base[7] == "-":
        return base
    if len(base) == 8 and base[4:6] == "-W":
        return base
    return fallback


def _read_queue() -> dict[str, Any]:
    _ensure_dirs()
    if not QUEUE_FILE.exists():
        data = {"items": [], "completed": []}
        QUEUE_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return data
    try:
        return json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        data = {"items": [], "completed": []}
        QUEUE_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return data


def _write_queue(data: dict[str, Any]) -> None:
    QUEUE_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


@router.get("/queue")
def get_intel_queue() -> dict[str, Any]:
    return _read_queue()


@router.post("/queue")
async def create_intel_queue_item(request: Request) -> dict[str, Any]:
    body = await request.json()
    topic = str(body.get("topic", "")).strip()
    if not topic:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing topic")
    data = _read_queue()
    items = data.setdefault("items", [])
    max_priority = max((int(item.get("priority", 0)) for item in items), default=0)
    items.append(
        {
            "topic": topic,
            "priority": int(body.get("priority", max_priority + 1)),
            "addedAt": datetime.now().date().isoformat(),
            "addedBy": "Wei",
        }
    )
    items.sort(key=lambda item: int(item.get("priority", 0)))
    _write_queue(data)
    return data


@router.put("/queue")
async def update_intel_queue_item(request: Request) -> dict[str, Any]:
    body = await request.json()
    index = body.get("index")
    if not isinstance(index, int):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing index")
    data = _read_queue()
    items = data.setdefault("items", [])
    if index < 0 or index >= len(items):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Index out of range")
    item = items[index]
    if "topic" in body:
        item["topic"] = str(body.get("topic", "")).strip()
    if "priority" in body:
        item["priority"] = int(body["priority"])
    items.sort(key=lambda queue_item: int(queue_item.get("priority", 0)))
    _write_queue(data)
    return data


@router.delete("/queue")
def delete_intel_queue_item(index: int = Query(...)) -> dict[str, Any]:
    data = _read_queue()
    items = data.setdefault("items", [])
    if index < 0 or index >= len(items):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Index out of range")
    items.pop(index)
    _write_queue(data)
    return data


@router.post("/queue/reorder")
async def reorder_intel_queue(request: Request) -> dict[str, Any]:
    body = await request.json()
    order = body.get("order") or []
    if not isinstance(order, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid order")
    data = _read_queue()
    items = data.setdefault("items", [])
    ordered_indexes = [i for i in order if isinstance(i, int) and 0 <= i < len(items)]
    reordered = [items[i] for i in ordered_indexes]
    remaining = [item for idx, item in enumerate(items) if idx not in set(ordered_indexes)]
    data["items"] = reordered + remaining
    _write_queue(data)
    return data


@router.get("/reports")
def get_intel_reports(file: str | None = Query(default=None), type: ReportType = Query(default="daily")) -> dict[str, Any]:
    _ensure_dirs()
    if file:
        safe_name = Path(file).name
        if safe_name != file or not safe_name.endswith(".md"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file")
        file_path = _resolve_report_dir(type) / safe_name
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
        return {"file": safe_name, "type": type, "content": file_path.read_text(encoding="utf-8")}
    files: list[dict[str, Any]] = []
    for report_type, directory in (("daily", DAILY_DIR), ("weekly", WEEKLY_DIR)):
        if not directory.exists():
            continue
        for file_path in directory.glob("*.md"):
            stat = file_path.stat()
            files.append({
                "filename": file_path.name,
                "type": report_type,
                "date": _extract_date(file_path.name, datetime.fromtimestamp(stat.st_mtime).date().isoformat()),
                "sizeKb": max(1, (stat.st_size + 1023) // 1024),
                "modifiedAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
                "_sort_modified_ns": stat.st_mtime_ns,
            })
    files.sort(key=lambda item: (item["date"], item["_sort_modified_ns"]), reverse=True)
    for item in files:
        item.pop("_sort_modified_ns", None)
    return {"dailyDir": str(DAILY_DIR), "weeklyDir": str(WEEKLY_DIR), "count": len(files), "files": files}


@router.delete("/reports")
def delete_intel_report(file: str = Query(...), type: ReportType = Query(default="daily")) -> dict[str, Any]:
    safe_name = Path(file).name
    if safe_name != file or not safe_name.endswith(".md"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file")
    file_path = _resolve_report_dir(type) / safe_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    file_path.unlink()
    return {"deleted": safe_name, "type": type}
