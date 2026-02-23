"""add knowledge tables: knowledge_entries and knowledge_documents with hybrid search

Revision ID: m12a1b2c3d4e5
Revises: m8a1b2c3d4e5
Create Date: 2026-02-23 10:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "m12a1b2c3d4e5"
down_revision = "m8a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Ensure pgvector extension is installed
    bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))

    # -- knowledge_entries --
    if not inspector.has_table("knowledge_entries"):
        op.create_table(
            "knowledge_entries",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("organization_id", sa.Uuid(), nullable=False),
            sa.Column("board_id", sa.Uuid(), nullable=True),
            sa.Column("board_group_id", sa.Uuid(), nullable=True),
            sa.Column("agent_id", sa.Uuid(), nullable=True),
            sa.Column("title", sa.String(length=512), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("category", sa.String(length=128), nullable=True),
            sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("source_type", sa.String(length=64), nullable=True),
            sa.Column("source_ref", sa.JSON(), nullable=True),
            sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("search_vector", sa.Text(), nullable=True),
            sa.Column("embedding", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["board_id"], ["boards.id"]),
            sa.ForeignKeyConstraint(["board_group_id"], ["board_groups.id"]),
            sa.ForeignKeyConstraint(["agent_id"], ["agents.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    # Use raw SQL for specialized column types (tsvector, vector)
    # We need to alter the table to use proper PostgreSQL-native types
    try:
        bind.execute(sa.text(
            "ALTER TABLE knowledge_entries "
            "ALTER COLUMN search_vector TYPE tsvector USING NULL::tsvector"
        ))
    except Exception:
        pass  # Column may already be tsvector

    try:
        bind.execute(sa.text(
            "ALTER TABLE knowledge_entries "
            "ALTER COLUMN embedding TYPE vector(1536) USING NULL::vector"
        ))
    except Exception:
        pass  # Column may already be vector

    ke_indexes = {item.get("name") for item in inspector.get_indexes("knowledge_entries")}
    _create_index_if_missing(
        ke_indexes,
        "ix_knowledge_entries_org",
        "knowledge_entries",
        ["organization_id"],
    )
    _create_index_if_missing(
        ke_indexes,
        "ix_knowledge_entries_board",
        "knowledge_entries",
        ["board_id"],
    )
    _create_index_if_missing(
        ke_indexes,
        "ix_knowledge_entries_category",
        "knowledge_entries",
        ["organization_id", "category"],
    )

    # GIN index for full-text search
    try:
        bind.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_knowledge_entries_search "
            "ON knowledge_entries USING GIN(search_vector)"
        ))
    except Exception:
        pass

    # IVFFlat index for vector similarity search
    try:
        bind.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_knowledge_entries_embedding "
            "ON knowledge_entries USING ivfflat(embedding vector_cosine_ops) "
            "WITH (lists = 100)"
        ))
    except Exception:
        pass

    # Create trigger function and trigger for auto-updating search_vector
    bind.execute(sa.text("""
        CREATE OR REPLACE FUNCTION knowledge_search_vector_update() RETURNS TRIGGER AS $$
        BEGIN
          NEW.search_vector :=
            setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B') ||
            setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'C');
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """))

    bind.execute(sa.text("""
        DROP TRIGGER IF EXISTS trg_knowledge_search_vector ON knowledge_entries
    """))

    bind.execute(sa.text("""
        CREATE TRIGGER trg_knowledge_search_vector
          BEFORE INSERT OR UPDATE OF title, content, category
          ON knowledge_entries FOR EACH ROW
          EXECUTE FUNCTION knowledge_search_vector_update()
    """))

    # -- knowledge_documents --
    if not inspector.has_table("knowledge_documents"):
        op.create_table(
            "knowledge_documents",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("knowledge_entry_id", sa.Uuid(), nullable=False),
            sa.Column("file_name", sa.String(length=512), nullable=False),
            sa.Column("file_type", sa.String(length=128), nullable=True),
            sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
            sa.Column("storage_url", sa.String(length=2048), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["knowledge_entry_id"], ["knowledge_entries.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
        )

    kd_indexes = {item.get("name") for item in inspector.get_indexes("knowledge_documents")}
    _create_index_if_missing(
        kd_indexes,
        "ix_knowledge_documents_entry",
        "knowledge_documents",
        ["knowledge_entry_id"],
    )


def _create_index_if_missing(
    existing: set,
    name: str,
    table: str,
    columns: list[str],
    unique: bool = False,
) -> None:
    if name not in existing:
        op.create_index(name, table, columns, unique=unique)


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DROP TRIGGER IF EXISTS trg_knowledge_search_vector ON knowledge_entries"))
    bind.execute(sa.text("DROP FUNCTION IF EXISTS knowledge_search_vector_update"))

    op.drop_index("ix_knowledge_documents_entry", table_name="knowledge_documents")
    op.drop_table("knowledge_documents")

    try:
        op.drop_index("ix_knowledge_entries_embedding", table_name="knowledge_entries")
    except Exception:
        pass
    try:
        op.drop_index("ix_knowledge_entries_search", table_name="knowledge_entries")
    except Exception:
        pass
    op.drop_index("ix_knowledge_entries_category", table_name="knowledge_entries")
    op.drop_index("ix_knowledge_entries_board", table_name="knowledge_entries")
    op.drop_index("ix_knowledge_entries_org", table_name="knowledge_entries")
    op.drop_table("knowledge_entries")
