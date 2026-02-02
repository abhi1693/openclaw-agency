from __future__ import annotations

from sqlmodel import SQLModel


class DepartmentCreate(SQLModel):
    name: str
    head_employee_id: int | None = None


class DepartmentUpdate(SQLModel):
    name: str | None = None
    head_employee_id: int | None = None


class TeamCreate(SQLModel):
    name: str
    department_id: int
    lead_employee_id: int | None = None


class TeamUpdate(SQLModel):
    name: str | None = None
    department_id: int | None = None
    lead_employee_id: int | None = None


class EmployeeCreate(SQLModel):
    name: str
    employee_type: str
    department_id: int | None = None
    team_id: int | None = None
    manager_id: int | None = None
    title: str | None = None
    status: str = "active"

    # OpenClaw integration
    openclaw_session_key: str | None = None
    notify_enabled: bool = True


class EmployeeUpdate(SQLModel):
    name: str | None = None
    employee_type: str | None = None
    department_id: int | None = None
    team_id: int | None = None
    manager_id: int | None = None
    title: str | None = None
    status: str | None = None

    # OpenClaw integration
    openclaw_session_key: str | None = None
    notify_enabled: bool | None = None
