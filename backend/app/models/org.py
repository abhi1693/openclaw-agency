from __future__ import annotations

from typing import Optional

from sqlmodel import Field, SQLModel


class Department(SQLModel, table=True):
    __tablename__ = "departments"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    head_employee_id: int | None = Field(default=None, foreign_key="employees.id")


class Team(SQLModel, table=True):
    __tablename__ = "teams"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)

    department_id: int = Field(foreign_key="departments.id")
    lead_employee_id: int | None = Field(default=None, foreign_key="employees.id")


class Employee(SQLModel, table=True):
    __tablename__ = "employees"

    id: int | None = Field(default=None, primary_key=True)
    name: str
    employee_type: str  # human | agent

    department_id: int | None = Field(default=None, foreign_key="departments.id")
    team_id: int | None = Field(default=None, foreign_key="teams.id")
    manager_id: int | None = Field(default=None, foreign_key="employees.id")

    title: str | None = None
    status: str = Field(default="active")

    # OpenClaw integration
    openclaw_session_key: str | None = None
    notify_enabled: bool = Field(default=True)
