"""Pydantic schemas for the Digital Memory Hub (M12)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class KnowledgeDocumentRead(BaseModel):
    """Serialized knowledge document attachment."""

    id: UUID
    knowledge_entry_id: UUID
    file_name: str
    file_type: str | None
    file_size_bytes: int | None
    storage_url: str
    created_at: datetime

    model_config = {"from_attributes": True}


class KnowledgeEntryRead(BaseModel):
    """Serialized knowledge entry for API responses."""

    id: UUID
    organization_id: UUID
    board_id: UUID | None
    board_group_id: UUID | None
    agent_id: UUID | None
    title: str
    content: str
    category: str | None
    tags: list
    source_type: str | None
    source_ref: dict | None
    is_pinned: bool
    created_at: datetime
    updated_at: datetime
    documents: list[KnowledgeDocumentRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class KnowledgeEntryCreate(BaseModel):
    """Payload for creating a knowledge entry."""

    title: str = Field(max_length=512)
    content: str
    category: str | None = Field(default=None, max_length=128)
    tags: list = Field(default_factory=list)
    source_type: str | None = None
    source_ref: dict | None = None
    board_id: UUID | None = None
    board_group_id: UUID | None = None
    agent_id: UUID | None = None


class KnowledgeEntryUpdate(BaseModel):
    """Payload for updating a knowledge entry."""

    title: str | None = Field(default=None, max_length=512)
    content: str | None = None
    category: str | None = None
    tags: list | None = None
    source_type: str | None = None
    source_ref: dict | None = None
    board_id: UUID | None = None
    is_pinned: bool | None = None


class KnowledgeSearchRequest(BaseModel):
    """Request payload for searching the knowledge base."""

    query: str = Field(min_length=1, max_length=1000)
    mode: Literal["keyword", "semantic", "hybrid"] = "hybrid"
    board_id: UUID | None = None
    category: str | None = None
    limit: int = Field(default=20, ge=1, le=100)


class KnowledgeSearchResult(BaseModel):
    """A single search result with relevance score."""

    entry: KnowledgeEntryRead
    score: float


class KnowledgeSearchResponse(BaseModel):
    """Response for knowledge base search."""

    items: list[KnowledgeEntryRead]
    scores: list[float]


class AgentKnowledgeCreate(BaseModel):
    """Payload for agent-facing knowledge creation endpoint."""

    title: str = Field(max_length=512)
    content: str
    category: str | None = None
    tags: list = Field(default_factory=list)
    source_ref: dict | None = None
    board_id: UUID | None = None
