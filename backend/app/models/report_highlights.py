"""Report highlight persistence model."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlmodel import Field, SQLModel

from app.core.time import utcnow


class ReportHighlight(SQLModel, table=True):
    """User-created text highlights inside report modals."""

    __tablename__ = "report_highlights"  # pyright: ignore[reportAssignmentType]

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    type: str  # "idea" | "action" | "bookmark" | "research"
    text: str  # selected text excerpt
    note: Optional[str] = None  # optional user annotation
    priority: str = "medium"  # "low" | "medium" | "high"
    status: str = "open"  # "open" | "in_progress" | "done"

    # source positioning
    report_tab: str  # "discovery" | "listing" | "ppc" | "strategy" | "intel"
    report_filename: str  # report filename
    report_heading: Optional[str] = None  # nearest h2/h3 heading for backlink
    text_snippet: str  # first 100 chars of selected text for re-location

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
