"""Gateway model storing organization-level gateway integration metadata."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlmodel import Column, Field
from sqlmodel import JSON as SA_JSON

from app.core.time import utcnow
from app.models.base import QueryModel

RUNTIME_ANNOTATION_TYPES = (datetime,)


class Gateway(QueryModel, table=True):
    """Configured external gateway endpoint and authentication settings."""

    __tablename__ = "gateways"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    name: str
    url: str
    token: str | None = Field(default=None)
    workspace_root: str
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    # --- Gateway auto-registration fields (M2) ---
    registration_token_hash: str | None = Field(default=None, max_length=255)
    status: str = Field(default="pending", max_length=32, index=True)
    last_heartbeat_at: datetime | None = Field(default=None)
    connection_info: dict[str, Any] | None = Field(
        default=None, sa_column=Column(SA_JSON, nullable=True)
    )
    auto_registered: bool = Field(default=False)
