"""Discovery, Strategy, and Listing report API endpoints."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, status

router = APIRouter(tags=["reports"])
HOME = Path.home()
DISCOVERY_DIR = HOME / ".openclaw" / "workspace" / "reports" / "discovery"
LISTING_DIR = HOME / ".openclaw" / "workspace" / "reports" / "listing"
STRATEGY_DIR = HOME / ".openclaw" / "workspace" / "reports" / "strategy"
RESEARCH_DIR = HOME / ".openclaw" / "workspace" / "reports" / "research"
EXTRA_DIRS = [
    HOME / ".openclaw" / "workspace-intel" / "reports",
    HOME / ".openclaw" / "workspace-strategy" / "reports",
]


def _ensure_dirs() -> None:
    for directory in (DISCOVERY_DIR, LISTING_DIR, STRATEGY_DIR, RESEARCH_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def _safe_md(file: str) -> str:
    safe_name = Path(file).name
    if safe_name != file or not safe_name.endswith(".md"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file")
    return safe_name


def _title(path: Path) -> str | None:
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("# "):
                return line[2:].strip()
    except Exception:
        return None
    return None


def _read_report(directory: Path, file: str) -> dict:
    safe = _safe_md(file)
    target = directory / safe
    if not target.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return {"file": safe, "content": target.read_text(encoding="utf-8")}


def _delete_report(directory: Path, file: str) -> dict:
    safe = _safe_md(file)
    target = directory / safe
    if not target.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    target.unlink()
    return {"deleted": safe}


def _parse_discovery(filename: str) -> tuple[str, str]:
    base = filename.removesuffix(".md")
    match = re.search(r"(\d{4}-\d{2}-\d{2})$", base)
    if match:
        return base[: -(len(match.group(1)) + 1)], match.group(1)
    return base, ""


def _parse_listing(filename: str) -> dict:
    base = filename.removesuffix(".md")
    parts = base.split("-")
    if len(parts) >= 4 and len(parts[0]) == 10 and parts[0].isalnum():
        return {"asin": parts[0], "type": "-".join(parts[1:-3]), "date": "-".join(parts[-3:])}
    match = re.search(r"(\d{4}-\d{2}-\d{2})$", base)
    if match:
        return {"asin": "", "type": base[: -(len(match.group(1)) + 1)], "date": match.group(1)}
    return {"asin": "", "type": base, "date": ""}


def _list_basic(directory: Path, parser):
    items = []
    for path in directory.glob("*.md"):
        stat = path.stat()
        items.append({
            "filename": path.name,
            **parser(path.name),
            "sizeKb": max(1, (stat.st_size + 1023) // 1024),
            "modifiedAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
            "title": _title(path),
        })
    return items


@router.get("/api/discovery/reports")
def get_discovery_reports(file: str | None = Query(default=None)) -> dict:
    _ensure_dirs()
    if file:
        return _read_report(DISCOVERY_DIR, file)
    files = _list_basic(DISCOVERY_DIR, lambda name: dict(zip(["prefix", "date"], _parse_discovery(name))))
    files.sort(key=lambda item: (item.get("date", ""), item.get("modifiedAt", "")), reverse=True)
    return {"reportsDir": str(DISCOVERY_DIR), "count": len(files), "files": files}


@router.delete("/api/discovery/reports")
def delete_discovery_report(file: str = Query(...)) -> dict:
    return _delete_report(DISCOVERY_DIR, file)


@router.get("/api/listing/reports")
def get_listing_reports(file: str | None = Query(default=None)) -> dict:
    _ensure_dirs()
    if file:
        return _read_report(LISTING_DIR, file)
    files = [item for item in _list_basic(LISTING_DIR, _parse_listing) if "template" not in item["filename"].lower()]
    files.sort(key=lambda item: item.get("modifiedAt", ""), reverse=True)
    return {"reportsDir": str(LISTING_DIR), "count": len(files), "files": files}


@router.delete("/api/listing/reports")
def delete_listing_report(file: str = Query(...)) -> dict:
    return _delete_report(LISTING_DIR, file)


@router.get("/api/strategy/reports")
def get_strategy_reports(file: str | None = Query(default=None)) -> dict:
    _ensure_dirs()
    search_dirs = [STRATEGY_DIR, RESEARCH_DIR, *EXTRA_DIRS]
    if file:
        safe = _safe_md(file)
        for directory in search_dirs:
            target = directory / safe
            if target.exists():
                return {"file": safe, "content": target.read_text(encoding="utf-8")}
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    seen: dict[str, tuple[Path, Path]] = {}
    for directory in reversed(search_dirs[2:]):
        if directory.exists():
            for item in directory.glob("*.md"):
                seen[item.name] = (directory, item)
    for directory in (RESEARCH_DIR, STRATEGY_DIR):
        for item in directory.glob("*.md"):
            seen[item.name] = (directory, item)
    files = []
    for filename, (_, path) in seen.items():
        stat = path.stat()
        prefix, date = _parse_discovery(filename)
        files.append({
            "filename": filename,
            "prefix": prefix,
            "date": date or datetime.fromtimestamp(stat.st_mtime).date().isoformat(),
            "sizeKb": max(1, (stat.st_size + 1023) // 1024),
            "modifiedAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
            "title": _title(path),
        })
    files.sort(key=lambda item: (item.get("date", ""), item.get("modifiedAt", "")), reverse=True)
    return {"reportsDir": str(STRATEGY_DIR), "count": len(files), "files": files}


@router.delete("/api/strategy/reports")
def delete_strategy_report(file: str = Query(...)) -> dict:
    safe = _safe_md(file)
    for directory in [STRATEGY_DIR, RESEARCH_DIR, *EXTRA_DIRS]:
        target = directory / safe
        if target.exists():
            target.unlink()
            return {"deleted": safe}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
