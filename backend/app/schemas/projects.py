from __future__ import annotations

from sqlmodel import SQLModel


class ProjectCreate(SQLModel):
    name: str
    status: str = "active"
    team_id: int | None = None


class ProjectUpdate(SQLModel):
    name: str | None = None
    status: str | None = None
    team_id: int | None = None
