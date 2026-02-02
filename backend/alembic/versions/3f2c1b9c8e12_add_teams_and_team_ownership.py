"""Add teams and team ownership

Revision ID: 3f2c1b9c8e12
Revises: bacd5e6a253d
Create Date: 2026-02-02

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "3f2c1b9c8e12"
down_revision = "bacd5e6a253d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Teams
    op.create_table(
        "teams",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("department_id", sa.Integer(), nullable=False),
        sa.Column("lead_employee_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lead_employee_id"], ["employees.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("department_id", "name", name="uq_teams_department_id_name"),
    )
    op.create_index("ix_teams_name", "teams", ["name"], unique=False)
    op.create_index("ix_teams_department_id", "teams", ["department_id"], unique=False)

    # 2) Employees belong to one (optional) team
    op.add_column("employees", sa.Column("team_id", sa.Integer(), nullable=True))
    op.create_index("ix_employees_team_id", "employees", ["team_id"], unique=False)
    op.create_foreign_key(
        "fk_employees_team_id_teams",
        "employees",
        "teams",
        ["team_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 3) Projects are owned by teams (not departments)
    op.add_column("projects", sa.Column("team_id", sa.Integer(), nullable=True))
    op.create_index("ix_projects_team_id", "projects", ["team_id"], unique=False)
    op.create_foreign_key(
        "fk_projects_team_id_teams",
        "projects",
        "teams",
        ["team_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_projects_team_id_teams", "projects", type_="foreignkey")
    op.drop_index("ix_projects_team_id", table_name="projects")
    op.drop_column("projects", "team_id")

    op.drop_constraint("fk_employees_team_id_teams", "employees", type_="foreignkey")
    op.drop_index("ix_employees_team_id", table_name="employees")
    op.drop_column("employees", "team_id")

    op.drop_index("ix_teams_department_id", table_name="teams")
    op.drop_index("ix_teams_name", table_name="teams")
    op.drop_table("teams")
