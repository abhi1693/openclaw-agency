"""Intel reports and queue API endpoints."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, status

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


@router.get("/queue")
def get_intel_queue() -> dict[str, Any]:
    _ensure_dirs()
    if not QUEUE_FILE.exists():
        return {"items": [], "completed": []}

    try:
        return json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to parse intel queue file",
        ) from exc


@router.get("/reports")
def get_intel_reports(
    file: str | None = Query(default=None),
    type: ReportType = Query(default="daily"),
) -> dict[str, Any]:
    _ensure_dirs()

    if file:
        safe_name = Path(file).name
        if safe_name != file or not safe_name.endswith(".md"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file")

        file_path = _resolve_report_dir(type) / safe_name
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

        return {
            "file": safe_name,
            "type": type,
            "content": file_path.read_text(encoding="utf-8"),
        }

    files: list[dict[str, Any]] = []
    for report_type, directory in (("daily", DAILY_DIR), ("weekly", WEEKLY_DIR)):
        if not directory.exists():
            continue
        for file_path in directory.glob("*.md"):
            stat = file_path.stat()
            modified_at = stat.st_mtime
            modified_iso = file_path.stat().st_mtime_ns
            files.append(
                {
                    "filename": file_path.name,
                    "type": report_type,
                    "date": _extract_date(file_path.name, datetime.fromtimestamp(stat.st_mtime).date().isoformat()),
                    "sizeKb": max(1, (stat.st_size + 1023) // 1024),
                    "modifiedAt": datetime.fromtimestamp(modified_at).astimezone().isoformat(),
                    "_sort_modified_ns": modified_iso,
                }
            )

    files.sort(key=lambda item: (item["date"], item["_sort_modified_ns"]), reverse=True)
    for item in files:
        item.pop("_sort_modified_ns", None)

    return {
        "dailyDir": str(DAILY_DIR),
        "weeklyDir": str(WEEKLY_DIR),
        "count": len(files),
        "files": files,
    }
