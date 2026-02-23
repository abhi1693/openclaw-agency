"""Mission Control specific models for brands, performance, comms, etc."""

from __future__ import annotations

import datetime as _dt
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel


class Brand(QueryModel, table=True):
    __tablename__ = "brands"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(index=True)
    type: str = Field(default="ecommerce")
    domain: str | None = None
    shopify_store: str | None = None
    shopify_token: str | None = None
    meta_ad_account: str | None = None
    meta_token: str | None = None
    revenue_target: float = Field(default=0.0)
    current_revenue: float = Field(default=0.0)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class MCAgent(QueryModel, table=True):
    """Mission control agent roster (the 14 AI agents)."""
    __tablename__ = "mc_agents"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(index=True)
    emoji: str = Field(default="🤖")
    role: str = Field(default="")
    department: str = Field(default="", index=True)
    status: str = Field(default="active", index=True)
    last_active: datetime | None = None
    model_used: str | None = None
    tokens_today: int = Field(default=0)
    cost_today: float = Field(default=0.0)
    created_at: datetime = Field(default_factory=utcnow)


class MCTask(QueryModel, table=True):
    """Enhanced task model with full lifecycle tracking."""
    __tablename__ = "mc_tasks"

    # === IDENTITY ===
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_uid: str | None = Field(default=None, index=True, unique=True)
    title: str
    description: str | None = Field(default=None, sa_column=Column(Text, nullable=True))

    # === CATEGORIZATION ===
    category: str | None = Field(default=None, index=True)
    sub_category: str | None = Field(default=None)

    # === PRIORITY & URGENCY ===
    priority: str | None = Field(default="medium", index=True)
    urgency_flag: bool | None = Field(default=False)

    # === STATUS & WORKFLOW ===
    status: str = Field(default="inbox", index=True)
    blocked_reason: str | None = Field(default=None)

    # === ASSIGNMENT ===
    assigned_agent: str | None = Field(default=None, index=True)
    collaborator_agents: list[str] | None = Field(default=None, sa_column=Column(JSON))
    created_by: str | None = Field(default=None)
    assigned_by: str | None = Field(default=None)

    # === BRAND ASSOCIATION ===
    brand_id: UUID | None = Field(default=None, index=True)
    brand_name: str | None = Field(default=None)

    # === CHECKLIST ===
    checklist: list[dict] | None = Field(  # type: ignore[assignment]
        default=None, sa_column=Column("checklist", JSON, nullable=True)
    )
    checklist_progress: float | None = Field(default=0.0)

    # === SKILLS REQUIRED ===
    skills_required: list[str] | None = Field(
        default=None, sa_column=Column("skills_required", JSON, nullable=True)
    )

    # === REFERENCE DOCUMENTS ===
    reference_docs: list[dict] | None = Field(  # type: ignore[assignment]
        default=None, sa_column=Column("reference_docs", JSON, nullable=True)
    )

    # === NOTES ===
    notes: str | None = Field(default=None)

    # === TAGS ===
    tags: list[str] | None = Field(default=None, sa_column=Column("tags", JSON))

    # === TIME TRACKING ===
    due_date: datetime | None = Field(default=None)
    started_at: datetime | None = Field(default=None)
    completed_at: datetime | None = Field(default=None)
    estimated_hours: float | None = Field(default=None)

    # === RELATIONSHIPS ===
    parent_task_id: UUID | None = Field(default=None)
    depends_on: list[str] | None = Field(
        default=None, sa_column=Column("depends_on", JSON, nullable=True)
    )

    # === METADATA ===
    source: str | None = Field(default="manual")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class TaskActivityLog(QueryModel, table=True):
    """Immutable audit trail for every task."""
    __tablename__ = "task_activity_logs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(index=True)
    task_uid: str = Field(index=True)

    action: str
    actor: str
    actor_type: str = Field(default="human")

    details: dict | None = Field(  # type: ignore[assignment]
        default=None, sa_column=Column(JSON)
    )

    timestamp: datetime = Field(default_factory=utcnow)


class TaskComment(QueryModel, table=True):
    """Comments and communications on a specific task."""
    __tablename__ = "task_comments"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(index=True)
    task_uid: str = Field(index=True)

    author: str
    author_type: str
    content: str = Field(sa_column=Column(Text))

    parent_comment_id: UUID | None = Field(default=None)

    mentions: list[str] | None = Field(
        default=None, sa_column=Column(JSON)
    )

    is_system_message: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)


class MCUser(QueryModel, table=True):
    """User accounts for Mission Control."""
    __tablename__ = "mc_users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    password_hash: str
    name: str

    role: str = Field(default="viewer", index=True)

    is_active: bool = Field(default=True)
    last_login: datetime | None = Field(default=None)

    custom_permissions: dict | None = Field(  # type: ignore[assignment]
        default=None, sa_column=Column(JSON)
    )

    brand_access: list[str] | None = Field(
        default=None, sa_column=Column("brand_access", JSON, nullable=True)
    )

    department_access: list[str] | None = Field(
        default=None, sa_column=Column("department_access", JSON, nullable=True)
    )

    avatar_url: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ActivityFeedEntry(QueryModel, table=True):
    __tablename__ = "activity_feed"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    type: str = Field(default="message", index=True)  # message/status/mission/handoff/broadcast
    from_agent: str | None = None
    to_agent: str | None = None
    content: str = Field(default="", sa_column=Column(Text))
    mission_id: str | None = None
    timestamp: datetime = Field(default_factory=utcnow)


class CommsSession(QueryModel, table=True):
    __tablename__ = "comms_sessions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    type: str = Field(default="strategy")  # strategy/handoff/review
    title: str = Field(default="")
    participants: list[str] | None = Field(default=None, sa_column=Column(JSON))
    start_time: datetime = Field(default_factory=utcnow)
    end_time: datetime | None = None
    tags: list[str] | None = Field(default=None, sa_column=Column(JSON))


class CommsMessage(QueryModel, table=True):
    __tablename__ = "comms_messages"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(index=True)
    from_agent: str = Field(default="")
    content: str = Field(default="", sa_column=Column(Text))
    timestamp: datetime = Field(default_factory=utcnow)


class SessionNotes(QueryModel, table=True):
    __tablename__ = "session_notes"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(index=True)
    decisions: list[Any] | None = Field(default=None, sa_column=Column(JSON))
    action_items: list[Any] | None = Field(default=None, sa_column=Column(JSON))
    next_review: datetime | None = None


class PerformanceSnapshot(QueryModel, table=True):
    __tablename__ = "performance_snapshots"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    brand_id: UUID | None = Field(default=None, index=True)
    snap_date: _dt.date = Field(index=True)
    revenue: float = Field(default=0.0)
    orders: int = Field(default=0)
    aov: float = Field(default=0.0)
    ad_spend: float = Field(default=0.0)
    roas: float = Field(default=0.0)
    impressions: int = Field(default=0)
    clicks: int = Field(default=0)
    timestamp: datetime = Field(default_factory=utcnow)
