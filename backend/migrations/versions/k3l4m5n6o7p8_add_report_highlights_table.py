"""add report_highlights table

Revision ID: k3l4m5n6o7p8
Revises: j2k3l4m5n6o7
Create Date: 2026-03-13 00:00:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "k3l4m5n6o7p8"
down_revision = "j2k3l4m5n6o7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "report_highlights",
        sa.Column("id", sa.String(), nullable=False, primary_key=True),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("report_tab", sa.String(), nullable=False),
        sa.Column("report_filename", sa.String(), nullable=False),
        sa.Column("report_heading", sa.String(), nullable=True),
        sa.Column("text_snippet", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_report_highlights_type", "report_highlights", ["type"])
    op.create_index("ix_report_highlights_status", "report_highlights", ["status"])
    op.create_index("ix_report_highlights_report_tab", "report_highlights", ["report_tab"])
    op.create_index("ix_report_highlights_report_filename", "report_highlights", ["report_filename"])
    op.create_index("ix_report_highlights_created_at", "report_highlights", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_report_highlights_created_at", "report_highlights")
    op.drop_index("ix_report_highlights_report_filename", "report_highlights")
    op.drop_index("ix_report_highlights_report_tab", "report_highlights")
    op.drop_index("ix_report_highlights_status", "report_highlights")
    op.drop_index("ix_report_highlights_type", "report_highlights")
    op.drop_table("report_highlights")
