"""Knowledge entry and document models for the Digital Memory Hub."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel
from app.models.tenancy import TenantScoped


class KnowledgeEntry(TenantScoped, table=True):
    """Organization knowledge base entry with full-text and vector search support."""

    __tablename__ = "knowledge_entries"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    board_id: UUID | None = Field(default=None, foreign_key="boards.id", index=True)
    board_group_id: UUID | None = Field(default=None, foreign_key="board_groups.id")
    agent_id: UUID | None = Field(default=None, foreign_key="agents.id")

    title: str = Field(max_length=512)
    content: str = Field(sa_column=Column(Text, nullable=False))
    category: str | None = Field(default=None, max_length=128, index=True)
    tags: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    source_type: str | None = Field(default=None, max_length=64)
    source_ref: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    is_pinned: bool = Field(default=False)

    # search_vector and embedding are managed by DB trigger / background job.
    # These are stored as tsvector / vector(1536) in the DB (set via raw SQL in migration),
    # but mapped here as opaque Text to allow SQLModel to track the columns.
    search_vector: str | None = Field(
        default=None,
        sa_column=Column("search_vector", Text, nullable=True),
    )
    embedding: str | None = Field(
        default=None,
        sa_column=Column("embedding", Text, nullable=True),
    )

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class KnowledgeDocument(QueryModel, table=True):
    """File attachment for a knowledge entry stored in OSS."""

    __tablename__ = "knowledge_documents"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    knowledge_entry_id: UUID = Field(
        foreign_key="knowledge_entries.id",
        index=True,
        ondelete="CASCADE",
    )
    file_name: str = Field(max_length=512)
    file_type: str | None = Field(default=None, max_length=128)
    file_size_bytes: int | None = Field(default=None)
    storage_url: str = Field(max_length=2048)

    created_at: datetime = Field(default_factory=utcnow)
