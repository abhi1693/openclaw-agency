"""Report highlights CRUD API endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.time import utcnow
from app.db.session import get_session
from app.models.report_highlights import ReportHighlight

router = APIRouter(prefix="/report-highlights", tags=["report-highlights"])


# ── Request/Response schemas ──────────────────────────────────────────────────


class CreateHighlightRequest(BaseModel):
    type: str  # "idea" | "action" | "bookmark" | "research"
    text: str
    note: Optional[str] = None
    priority: str = "medium"
    report_tab: str
    report_filename: str
    report_heading: Optional[str] = None
    text_snippet: str


class UpdateHighlightRequest(BaseModel):
    note: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _to_dict(h: ReportHighlight) -> dict[str, Any]:
    return {
        "id": h.id,
        "type": h.type,
        "text": h.text,
        "note": h.note,
        "priority": h.priority,
        "status": h.status,
        "report_tab": h.report_tab,
        "report_filename": h.report_filename,
        "report_heading": h.report_heading,
        "text_snippet": h.text_snippet,
        "created_at": h.created_at.isoformat() if h.created_at else None,
        "updated_at": h.updated_at.isoformat() if h.updated_at else None,
    }


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("")
async def list_highlights(
    type: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    report_tab: Optional[str] = Query(default=None),
    report_filename: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """List highlights with optional filters."""
    stmt = select(ReportHighlight)
    if type:
        stmt = stmt.where(ReportHighlight.type == type)
    if status:
        stmt = stmt.where(ReportHighlight.status == status)
    if report_tab:
        stmt = stmt.where(ReportHighlight.report_tab == report_tab)
    if report_filename:
        stmt = stmt.where(ReportHighlight.report_filename == report_filename)
    result = await session.execute(stmt)
    highlights = result.scalars().all()
    return {"highlights": [_to_dict(h) for h in highlights]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_highlight(
    body: CreateHighlightRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Create a new report highlight."""
    VALID_TYPES = {"idea", "action", "bookmark", "research"}
    if body.type not in VALID_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"type must be one of {VALID_TYPES}",
        )
    highlight = ReportHighlight(
        type=body.type,
        text=body.text,
        note=body.note,
        priority=body.priority,
        report_tab=body.report_tab,
        report_filename=body.report_filename,
        report_heading=body.report_heading,
        text_snippet=body.text_snippet,
    )
    session.add(highlight)
    await session.commit()
    await session.refresh(highlight)
    return _to_dict(highlight)


@router.patch("/{highlight_id}")
async def update_highlight(
    highlight_id: str,
    body: UpdateHighlightRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Update a highlight's status, note, or priority."""
    result = await session.execute(
        select(ReportHighlight).where(ReportHighlight.id == highlight_id)
    )
    highlight = result.scalar_one_or_none()
    if not highlight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Highlight not found"
        )
    if body.note is not None:
        highlight.note = body.note
    if body.priority is not None:
        highlight.priority = body.priority
    if body.status is not None:
        highlight.status = body.status
    highlight.updated_at = utcnow()
    session.add(highlight)
    await session.commit()
    await session.refresh(highlight)
    return _to_dict(highlight)


@router.delete("/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_highlight(
    highlight_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a highlight by ID."""
    result = await session.execute(
        select(ReportHighlight).where(ReportHighlight.id == highlight_id)
    )
    highlight = result.scalar_one_or_none()
    if not highlight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Highlight not found"
        )
    await session.delete(highlight)
    await session.commit()
